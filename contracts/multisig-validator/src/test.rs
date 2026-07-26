#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    vec, Address, BytesN, Env, Vec,
};

fn key(env: &Env, b: u8) -> BytesN<32> {
    BytesN::from_array(env, &[b; 32])
}

fn signer(env: &Env, b: u8, weight: u32) -> Signer {
    Signer { key: key(env, b), weight }
}

/// Register a 3-signer account with weights {A:2, B:1, C:1} and threshold 3.
fn setup(env: &Env) -> (Address, MultisigValidatorClient<'_>) {
    let contract_id = env.register(MultisigValidator, ());
    let client = MultisigValidatorClient::new(env, &contract_id);

    let account = Address::generate(env);
    let signers: Vec<Signer> = vec![
        env,
        signer(env, 0xA1, 2),
        signer(env, 0xB2, 1),
        signer(env, 0xC3, 1),
    ];
    client.configure_account(&account, &signers, &3u32);
    (account, client)
}

#[test]
fn test_configure_and_read() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup(&env);

    assert_eq!(client.get_threshold(&account), 3u32);
    assert_eq!(client.total_weight(&account), 4u32);
    assert_eq!(client.get_config(&account).signers.len(), 3u32);
}

#[test]
fn test_meets_threshold_exactly() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup(&env);

    // A(2) + B(1) = 3 == threshold.
    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    assert_eq!(client.tally_weight(&account, &keys), 3u32);
    assert!(client.verify_threshold(&account, &keys));
    client.enforce_threshold(&account, &keys); // does not panic
}

#[test]
fn test_exceeds_threshold() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup(&env);

    // A(2) + B(1) + C(1) = 4 > 3.
    let keys: Vec<BytesN<32>> =
        vec![&env, key(&env, 0xA1), key(&env, 0xB2), key(&env, 0xC3)];
    assert_eq!(client.tally_weight(&account, &keys), 4u32);
    assert!(client.verify_threshold(&account, &keys));
}

#[test]
fn test_insufficient_weight_returns_false() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup(&env);

    // B(1) + C(1) = 2 < 3.
    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xB2), key(&env, 0xC3)];
    assert_eq!(client.tally_weight(&account, &keys), 2u32);
    assert!(!client.verify_threshold(&account, &keys));
}

#[test]
fn test_enforce_threshold_rejects_insufficient() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup(&env);

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xC3)]; // weight 1 < 3
    let res = client.try_enforce_threshold(&account, &keys);
    assert_eq!(res, Err(Ok(ValidatorError::InsufficientWeight)));
}

#[test]
fn test_unknown_signer_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup(&env);

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xFF)];
    let res = client.try_verify_threshold(&account, &keys);
    assert_eq!(res, Err(Ok(ValidatorError::UnknownSigner)));
}

#[test]
fn test_duplicate_presented_key_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup(&env);

    // Presenting A twice must not double-count its weight to reach 4.
    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xA1)];
    let res = client.try_tally_weight(&account, &keys);
    assert_eq!(res, Err(Ok(ValidatorError::DuplicateSigner)));
}

#[test]
fn test_threshold_above_total_weight_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(MultisigValidator, ());
    let client = MultisigValidatorClient::new(&env, &contract_id);
    let account = Address::generate(&env);

    let signers: Vec<Signer> = vec![&env, signer(&env, 0xA1, 1), signer(&env, 0xB2, 1)];
    // threshold 3 > total weight 2.
    let res = client.try_configure_account(&account, &signers, &3u32);
    assert_eq!(res, Err(Ok(ValidatorError::InvalidThreshold)));
}

#[test]
fn test_zero_weight_signer_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(MultisigValidator, ());
    let client = MultisigValidatorClient::new(&env, &contract_id);
    let account = Address::generate(&env);

    let signers: Vec<Signer> = vec![&env, signer(&env, 0xA1, 0)];
    let res = client.try_configure_account(&account, &signers, &1u32);
    assert_eq!(res, Err(Ok(ValidatorError::InvalidWeight)));
}

#[test]
fn test_duplicate_configured_signer_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(MultisigValidator, ());
    let client = MultisigValidatorClient::new(&env, &contract_id);
    let account = Address::generate(&env);

    let signers: Vec<Signer> = vec![&env, signer(&env, 0xA1, 1), signer(&env, 0xA1, 2)];
    let res = client.try_configure_account(&account, &signers, &1u32);
    assert_eq!(res, Err(Ok(ValidatorError::DuplicateSigner)));
}

#[test]
fn test_unconfigured_account_errors() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(MultisigValidator, ());
    let client = MultisigValidatorClient::new(&env, &contract_id);
    let account = Address::generate(&env);

    let res = client.try_get_threshold(&account);
    assert_eq!(res, Err(Ok(ValidatorError::AccountNotConfigured)));
}

// ── Timelock Tests ─────────────────────────────────────────────────────────

fn proposal_id(env: &Env, b: u8) -> BytesN<32> {
    BytesN::from_array(env, &[b; 32])
}

fn setup_with_timelock(env: &Env) -> (Address, MultisigValidatorClient<'_>) {
    let (account, client) = setup(env); // 3 signers, threshold 3
    client.configure_timelock(&account, &10u64); // 10-second delay
    env.ledger().set_timestamp(1_000_000);
    (account, client)
}

#[test]
fn test_configure_timelock_and_read() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup(&env);

    client.configure_timelock(&account, &30u64);
    let config = client.get_timelock(&account);
    assert_eq!(config.delay_seconds, 30u64);
}

#[test]
fn test_timelock_not_configured_errors() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup(&env);

    let res = client.try_get_timelock(&account);
    assert_eq!(res, Err(Ok(ValidatorError::TimelockNotConfigured)));
}

#[test]
fn test_submit_and_get_proposal() {
    let env = Env::default();
    env.mock_all_auths();
    let (_account, client) = setup_with_timelock(&env);
    let pid = proposal_id(&env, 0xAA);

    client.submit_action(&pid);
    let proposal = client.get_proposal(&pid);
    assert_eq!(proposal.state, ProposalState::Pending);
    assert_eq!(proposal.created_at, 1_000_000);
    // Default expiry should be set (non-zero in test = 1_000 ledgers from seq 0)
    assert!(proposal.expiration_ledger > 0);
}

#[test]
fn test_approve_transitions_to_locked() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup_with_timelock(&env);
    let pid = proposal_id(&env, 0xAA);

    client.submit_action(&pid, &0u32);

    // A(2) + B(1) = 3 >= threshold 3
    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    client.approve_action(&account, &pid, &keys);

    let proposal = client.get_proposal(&pid);
    assert_eq!(proposal.state, ProposalState::Locked);
    assert_eq!(proposal.ready_at, 1_000_010); // 1_000_000 + 10
}

#[test]
fn test_execute_after_timelock_elapsed() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup_with_timelock(&env);
    let pid = proposal_id(&env, 0xBB);

    client.submit_action(&pid, &0u32);

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    client.approve_action(&account, &pid, &keys);

    // Advance past the 10-second delay.
    env.ledger().set_timestamp(1_000_011);

    client.execute_action(&pid);

    let proposal = client.get_proposal(&pid);
    assert_eq!(proposal.state, ProposalState::Executed);
}

#[test]
fn test_execute_before_timelock_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup_with_timelock(&env);
    let pid = proposal_id(&env, 0xCC);

    client.submit_action(&pid, &0u32);

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    client.approve_action(&account, &pid, &keys);

    // Only 5 seconds have passed; delay is 10.
    env.ledger().set_timestamp(1_000_005);

    let res = client.try_execute_action(&pid);
    assert_eq!(res, Err(Ok(ValidatorError::TimelockNotElapsed)));
}

#[test]
fn test_cannot_execute_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup_with_timelock(&env);
    let pid = proposal_id(&env, 0xDD);

    client.submit_action(&pid, &0u32);

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    client.approve_action(&account, &pid, &keys);

    env.ledger().set_timestamp(1_000_011);
    client.execute_action(&pid);

    let res = client.try_execute_action(&pid);
    assert_eq!(res, Err(Ok(ValidatorError::ProposalAlreadyExecuted)));
}

#[test]
fn test_cannot_approve_executed_proposal() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup_with_timelock(&env);
    let pid = proposal_id(&env, 0xEE);

    client.submit_action(&pid, &0u32);

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    client.approve_action(&account, &pid, &keys);
    env.ledger().set_timestamp(1_000_011);
    client.execute_action(&pid);

    let res = client.try_approve_action(&account, &pid, &keys);
    assert_eq!(res, Err(Ok(ValidatorError::ProposalAlreadyExecuted)));
}

#[test]
fn test_execute_without_approval_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (_account, client) = setup_with_timelock(&env);
    let pid = proposal_id(&env, 0xFF);

    client.submit_action(&pid, &0u32);
    // Never approved.

    env.ledger().set_timestamp(1_000_011);
    let res = client.try_execute_action(&pid);
    assert_eq!(res, Err(Ok(ValidatorError::NotYetApproved)));
}

#[test]
fn test_can_execute_returns_correctly() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup_with_timelock(&env);
    let pid = proposal_id(&env, 0x11);

    client.submit_action(&pid, &0u32);

    // Pending → can_execute false.
    assert!(!client.can_execute(&pid));

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    client.approve_action(&account, &pid, &keys);

    // Locked but before delay → false.
    assert!(!client.can_execute(&pid));

    // After delay → true.
    env.ledger().set_timestamp(1_000_011);
    assert!(client.can_execute(&pid));

    // Executed → false.
    client.execute_action(&pid);
    assert!(!client.can_execute(&pid));
}

#[test]
fn test_zero_delay_timelock_allows_immediate_execution() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup(&env);
    env.ledger().set_timestamp(1_000_000);

    client.configure_timelock(&account, &0u64); // No delay.
    let pid = proposal_id(&env, 0x22);
    client.submit_action(&pid, &0u32);

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    client.approve_action(&account, &pid, &keys);

    // ready_at = 1_000_000 + 0 = 1_000_000, which is <= current time.
    assert!(client.can_execute(&pid));
    client.execute_action(&pid);
    assert_eq!(client.get_proposal(&pid).state, ProposalState::Executed);
}

#[test]
fn test_approve_action_without_timelock_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup(&env); // No timelock configured.
    let pid = proposal_id(&env, 0x33);
    client.submit_action(&pid, &0u32);

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    let res = client.try_approve_action(&account, &pid, &keys);
    assert_eq!(res, Err(Ok(ValidatorError::TimelockNotConfigured)));
}

// ── Proposal Expiry Tests ──────────────────────────────────────────────────
//
// DEFAULT_PROPOSAL_EXPIRY_LEDGERS = 1_000 in test builds.
// Tests use env.ledger().set_sequence_number() to cross epoch boundaries.

#[test]
fn test_submit_stores_default_expiry_when_zero_passed() {
    // Passing 0 → effective_expiry = current_sequence + DEFAULT_PROPOSAL_EXPIRY_LEDGERS.
    let env = Env::default();
    env.mock_all_auths();
    let (_account, client) = setup_with_timelock(&env);

    // Start at ledger 100 so we can inspect the stored value clearly.
    env.ledger().with_mut(|l| l.sequence_number = 100);

    let pid = proposal_id(&env, 0x50);
    client.submit_action(&pid, &0u32);

    let proposal = client.get_proposal(&pid);
    // effective_expiry = 100 + 1_000 = 1_100
    assert_eq!(proposal.expiration_ledger, 1_100u32);
    assert!(!client.is_proposal_expired(&pid));
}

#[test]
fn test_submit_stores_explicit_expiry() {
    let env = Env::default();
    env.mock_all_auths();
    let (_account, client) = setup_with_timelock(&env);

    let pid = proposal_id(&env, 0x51);
    client.submit_action(&pid, &500u32); // explicit: expire at ledger 500

    let proposal = client.get_proposal(&pid);
    assert_eq!(proposal.expiration_ledger, 500u32);
}

#[test]
fn test_is_proposal_expired_returns_false_before_expiry() {
    let env = Env::default();
    env.mock_all_auths();
    let (_account, client) = setup_with_timelock(&env);

    env.ledger().with_mut(|l| l.sequence_number = 50);
    let pid = proposal_id(&env, 0x52);
    client.submit_action(&pid, &200u32); // expires at ledger 200

    // At ledger 50, still active.
    assert!(!client.is_proposal_expired(&pid));

    // Advance to exactly the expiry ledger — still valid (> not >=).
    env.ledger().with_mut(|l| l.sequence_number = 200);
    assert!(!client.is_proposal_expired(&pid));
}

#[test]
fn test_is_proposal_expired_returns_true_after_expiry() {
    let env = Env::default();
    env.mock_all_auths();
    let (_account, client) = setup_with_timelock(&env);

    env.ledger().with_mut(|l| l.sequence_number = 50);
    let pid = proposal_id(&env, 0x53);
    client.submit_action(&pid, &200u32);

    // One ledger past expiry.
    env.ledger().with_mut(|l| l.sequence_number = 201);
    assert!(client.is_proposal_expired(&pid));
}

#[test]
fn test_approve_rejected_after_expiry() {
    // A vote cast after the expiration ledger must be rejected with ProposalExpired.
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup_with_timelock(&env);

    env.ledger().with_mut(|l| l.sequence_number = 10);
    let pid = proposal_id(&env, 0x54);
    client.submit_action(&pid, &100u32); // expires at ledger 100

    // Advance past expiry.
    env.ledger().with_mut(|l| l.sequence_number = 101);
    env.ledger().set_timestamp(2_000_000);

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    let res = client.try_approve_action(&account, &pid, &keys);
    assert_eq!(
        res,
        Err(Ok(ValidatorError::ProposalExpired)),
        "vote after expiry must return ProposalExpired"
    );
}

#[test]
fn test_approve_accepted_at_exact_expiry_ledger() {
    // At exactly the expiration_ledger (not past it) voting must still succeed.
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup_with_timelock(&env);

    env.ledger().with_mut(|l| l.sequence_number = 10);
    env.ledger().set_timestamp(1_000_000);
    let pid = proposal_id(&env, 0x55);
    client.submit_action(&pid, &100u32); // expires strictly after ledger 100

    env.ledger().with_mut(|l| l.sequence_number = 100); // == expiry, not >
    env.ledger().set_timestamp(1_000_000);

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    client.approve_action(&account, &pid, &keys); // must not error

    let proposal = client.get_proposal(&pid);
    assert_eq!(proposal.state, ProposalState::Locked);
}

#[test]
fn test_execute_rejected_after_expiry() {
    // A Locked proposal that crosses its expiry ledger before execution is blocked.
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup_with_timelock(&env);

    env.ledger().with_mut(|l| l.sequence_number = 10);
    env.ledger().set_timestamp(1_000_000);

    // Expire at ledger 500; timelock delay = 10 s (very short).
    let pid = proposal_id(&env, 0x56);
    client.submit_action(&pid, &500u32);

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    client.approve_action(&account, &pid, &keys);

    // Satisfy the timelock delay but simultaneously cross the expiry ledger.
    env.ledger().with_mut(|l| l.sequence_number = 501); // past ledger 500
    env.ledger().set_timestamp(1_000_011); // past timelock delay

    let res = client.try_execute_action(&pid);
    assert_eq!(
        res,
        Err(Ok(ValidatorError::ProposalExpired)),
        "execute after expiry ledger must be rejected even if timelock elapsed"
    );
}

#[test]
fn test_prune_single_expired_proposal() {
    let env = Env::default();
    env.mock_all_auths();
    let (_account, client) = setup_with_timelock(&env);

    env.ledger().with_mut(|l| l.sequence_number = 10);
    let pid = proposal_id(&env, 0x60);
    client.submit_action(&pid, &100u32);

    // Advance past expiry.
    env.ledger().with_mut(|l| l.sequence_number = 101);

    let ids: Vec<BytesN<32>> = vec![&env, pid.clone()];
    let pruned = client.prune_expired_proposals(&ids);
    assert_eq!(pruned, 1u32, "one proposal should be pruned");

    // Proposal no longer in storage.
    let res = client.try_get_proposal(&pid);
    assert_eq!(res, Err(Ok(ValidatorError::ProposalNotFound)));
}

#[test]
fn test_prune_multiple_expired_proposals() {
    let env = Env::default();
    env.mock_all_auths();
    let (_account, client) = setup_with_timelock(&env);

    env.ledger().with_mut(|l| l.sequence_number = 5);
    let pid1 = proposal_id(&env, 0x61);
    let pid2 = proposal_id(&env, 0x62);
    let pid3 = proposal_id(&env, 0x63);
    client.submit_action(&pid1, &50u32);
    client.submit_action(&pid2, &50u32);
    client.submit_action(&pid3, &50u32);

    env.ledger().with_mut(|l| l.sequence_number = 51);

    let ids: Vec<BytesN<32>> = vec![&env, pid1.clone(), pid2.clone(), pid3.clone()];
    let pruned = client.prune_expired_proposals(&ids);
    assert_eq!(pruned, 3u32);

    assert_eq!(client.try_get_proposal(&pid1), Err(Ok(ValidatorError::ProposalNotFound)));
    assert_eq!(client.try_get_proposal(&pid2), Err(Ok(ValidatorError::ProposalNotFound)));
    assert_eq!(client.try_get_proposal(&pid3), Err(Ok(ValidatorError::ProposalNotFound)));
}

#[test]
fn test_prune_skips_already_missing_ids() {
    // An ID that was never submitted (or already pruned) is silently skipped.
    let env = Env::default();
    env.mock_all_auths();
    let (_account, client) = setup_with_timelock(&env);

    env.ledger().with_mut(|l| l.sequence_number = 5);
    let pid_real = proposal_id(&env, 0x64);
    let pid_ghost = proposal_id(&env, 0x65); // never submitted
    client.submit_action(&pid_real, &50u32);

    env.ledger().with_mut(|l| l.sequence_number = 51);

    let ids: Vec<BytesN<32>> = vec![&env, pid_real.clone(), pid_ghost.clone()];
    // Ghost id is missing but the call should still succeed and prune pid_real.
    let pruned = client.prune_expired_proposals(&ids);
    assert_eq!(pruned, 1u32);
    assert_eq!(client.try_get_proposal(&pid_real), Err(Ok(ValidatorError::ProposalNotFound)));
}

#[test]
fn test_prune_rejects_non_expired_proposal() {
    // If any proposal in the batch is still active the call returns ProposalNotExpired.
    let env = Env::default();
    env.mock_all_auths();
    let (_account, client) = setup_with_timelock(&env);

    env.ledger().with_mut(|l| l.sequence_number = 5);
    let pid_expired = proposal_id(&env, 0x66);
    let pid_active  = proposal_id(&env, 0x67);
    client.submit_action(&pid_expired, &50u32);  // expires at 50
    client.submit_action(&pid_active,  &500u32); // expires at 500

    // Advance past pid_expired but not pid_active.
    env.ledger().with_mut(|l| l.sequence_number = 51);

    let ids: Vec<BytesN<32>> = vec![&env, pid_expired.clone(), pid_active.clone()];
    let res = client.try_prune_expired_proposals(&ids);
    assert_eq!(
        res,
        Err(Ok(ValidatorError::ProposalNotExpired)),
        "batch containing a live proposal must be rejected"
    );
}

#[test]
fn test_prune_empty_batch_returns_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (_account, client) = setup_with_timelock(&env);

    let ids: Vec<BytesN<32>> = vec![&env];
    let pruned = client.prune_expired_proposals(&ids);
    assert_eq!(pruned, 0u32);
}

#[test]
fn test_prune_reclaims_storage_verified_via_get_proposal() {
    // After pruning, get_proposal must return ProposalNotFound — verifying the
    // storage entry was actually removed, not just marked.
    let env = Env::default();
    env.mock_all_auths();
    let (_account, client) = setup_with_timelock(&env);

    env.ledger().with_mut(|l| l.sequence_number = 1);
    let pid = proposal_id(&env, 0x68);
    client.submit_action(&pid, &10u32); // expires at ledger 10

    // Confirm it exists before pruning.
    assert!(client.try_get_proposal(&pid).is_ok());

    env.ledger().with_mut(|l| l.sequence_number = 11);
    let ids: Vec<BytesN<32>> = vec![&env, pid.clone()];
    client.prune_expired_proposals(&ids);

    // Storage entry must be gone.
    assert_eq!(
        client.try_get_proposal(&pid),
        Err(Ok(ValidatorError::ProposalNotFound)),
        "pruned proposal must not be retrievable"
    );
}

#[test]
fn test_expiry_independent_of_executed_proposals() {
    // An already-executed proposal that is also past its expiry should still
    // report is_proposal_expired = true (the two states are independent).
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup_with_timelock(&env);

    env.ledger().with_mut(|l| l.sequence_number = 1);
    env.ledger().set_timestamp(1_000_000);

    // Long expiry so execution succeeds before the expiry check fires.
    let pid = proposal_id(&env, 0x69);
    client.submit_action(&pid, &5_000u32); // expires at ledger 5_000

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    client.approve_action(&account, &pid, &keys);

    env.ledger().set_timestamp(1_000_011);
    client.execute_action(&pid); // succeeds: not yet expired, timelock elapsed

    // Now advance past the expiry.
    env.ledger().with_mut(|l| l.sequence_number = 5_001);
    assert!(client.is_proposal_expired(&pid));

    // Executed proposals cannot be pruned (they are in terminal state) but the
    // expired flag is reported correctly.
    // (Pruning executed proposals is valid — the state record is still removed.)
    let ids: Vec<BytesN<32>> = vec![&env, pid.clone()];
    let pruned = client.prune_expired_proposals(&ids);
    assert_eq!(pruned, 1u32);
}
