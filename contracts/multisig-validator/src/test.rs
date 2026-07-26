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
}

#[test]
fn test_approve_transitions_to_locked() {
    let env = Env::default();
    env.mock_all_auths();
    let (account, client) = setup_with_timelock(&env);
    let pid = proposal_id(&env, 0xAA);

    client.submit_action(&pid);

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

    client.submit_action(&pid);

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

    client.submit_action(&pid);

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

    client.submit_action(&pid);

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

    client.submit_action(&pid);

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

    client.submit_action(&pid);
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

    client.submit_action(&pid);

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
    client.submit_action(&pid);

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
    client.submit_action(&pid);

    let keys: Vec<BytesN<32>> = vec![&env, key(&env, 0xA1), key(&env, 0xB2)];
    let res = client.try_approve_action(&account, &pid, &keys);
    assert_eq!(res, Err(Ok(ValidatorError::TimelockNotConfigured)));
}

// ── Admin-managed k-of-n signer configuration ───────────────────────────────

/// Register an admin and a 3-signer `2-of-3` admin-managed set.
fn setup_admin(env: &Env) -> (Address, Vec<Address>, MultisigValidatorClient<'_>) {
    let contract_id = env.register(MultisigValidator, ());
    let client = MultisigValidatorClient::new(env, &contract_id);

    let admin = Address::generate(env);
    client.init_admin(&admin);

    let signers: Vec<Address> = vec![
        env,
        Address::generate(env),
        Address::generate(env),
        Address::generate(env),
    ];
    client.configure_signers(&signers, &2u32);
    (admin, signers, client)
}

#[test]
fn test_admin_configure_and_read() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, signers, client) = setup_admin(&env);

    let config = client.get_signer_config();
    assert_eq!(config.threshold, 2u32);
    assert_eq!(config.signers.len(), 3u32);
    assert_eq!(config.signers, signers);
}

#[test]
fn test_init_admin_twice_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, _signers, client) = setup_admin(&env);
    let res = client.try_init_admin(&Address::generate(&env));
    assert_eq!(res, Err(Ok(ValidatorError::AdminAlreadySet)));
}

#[test]
fn test_configure_signers_before_admin_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(MultisigValidator, ());
    let client = MultisigValidatorClient::new(&env, &contract_id);
    let signers: Vec<Address> = vec![&env, Address::generate(&env)];
    let res = client.try_configure_signers(&signers, &1u32);
    assert_eq!(res, Err(Ok(ValidatorError::AdminNotSet)));
}

#[test]
fn test_configure_rejects_zero_threshold() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(MultisigValidator, ());
    let client = MultisigValidatorClient::new(&env, &contract_id);
    client.init_admin(&Address::generate(&env));
    let signers: Vec<Address> = vec![&env, Address::generate(&env), Address::generate(&env)];
    let res = client.try_configure_signers(&signers, &0u32);
    assert_eq!(res, Err(Ok(ValidatorError::InvalidThreshold)));
}

#[test]
fn test_configure_rejects_threshold_over_signer_count() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(MultisigValidator, ());
    let client = MultisigValidatorClient::new(&env, &contract_id);
    client.init_admin(&Address::generate(&env));
    let signers: Vec<Address> = vec![&env, Address::generate(&env), Address::generate(&env)];
    let res = client.try_configure_signers(&signers, &3u32);
    assert_eq!(res, Err(Ok(ValidatorError::InvalidThreshold)));
}

#[test]
fn test_configure_rejects_duplicate_signers() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(MultisigValidator, ());
    let client = MultisigValidatorClient::new(&env, &contract_id);
    client.init_admin(&Address::generate(&env));
    let dup = Address::generate(&env);
    let signers: Vec<Address> = vec![&env, dup.clone(), dup];
    let res = client.try_configure_signers(&signers, &1u32);
    assert_eq!(res, Err(Ok(ValidatorError::SignerAlreadyExists)));
}

#[test]
fn test_set_threshold_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, _signers, client) = setup_admin(&env);
    client.set_threshold(&3u32);
    assert_eq!(client.get_signer_config().threshold, 3u32);
}

#[test]
fn test_set_threshold_rejects_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, _signers, client) = setup_admin(&env);
    let res = client.try_set_threshold(&0u32);
    assert_eq!(res, Err(Ok(ValidatorError::InvalidThreshold)));
}

#[test]
fn test_set_threshold_rejects_over_signer_count() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, _signers, client) = setup_admin(&env);
    let res = client.try_set_threshold(&4u32); // only 3 signers.
    assert_eq!(res, Err(Ok(ValidatorError::InvalidThreshold)));
}

#[test]
fn test_add_signer_success() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, _signers, client) = setup_admin(&env);
    let new_signer = Address::generate(&env);
    client.add_signer(&new_signer);

    let config = client.get_signer_config();
    assert_eq!(config.signers.len(), 4u32);
    assert!(config.signers.contains(&new_signer));
}

#[test]
fn test_add_duplicate_signer_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, signers, client) = setup_admin(&env);
    let res = client.try_add_signer(&signers.get_unchecked(0));
    assert_eq!(res, Err(Ok(ValidatorError::SignerAlreadyExists)));
}

#[test]
fn test_remove_signer_below_threshold_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, signers, client) = setup_admin(&env);
    // 3 signers, threshold 2. Removing one -> 2 signers (ok).
    client.remove_signer(&signers.get_unchecked(2));
    // Now 2 signers, threshold 2. Removing another -> 1 < 2 (rejected).
    let res = client.try_remove_signer(&signers.get_unchecked(1));
    assert_eq!(res, Err(Ok(ValidatorError::InvalidThreshold)));
}

#[test]
fn test_remove_unknown_signer_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, _signers, client) = setup_admin(&env);
    let res = client.try_remove_signer(&Address::generate(&env));
    assert_eq!(res, Err(Ok(ValidatorError::SignerNotFound)));
}

#[test]
fn test_verify_signatures_meets_threshold() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, signers, client) = setup_admin(&env);
    let presented: Vec<Address> =
        vec![&env, signers.get_unchecked(0), signers.get_unchecked(1)];
    assert_eq!(client.count_valid_signers(&presented), 2u32);
    assert!(client.verify_signatures(&presented));
    client.enforce_signatures(&presented); // does not panic
}

#[test]
fn test_verify_signatures_below_threshold_reverts() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, signers, client) = setup_admin(&env);
    let presented: Vec<Address> = vec![&env, signers.get_unchecked(0)];
    assert!(!client.verify_signatures(&presented));
    let res = client.try_enforce_signatures(&presented);
    assert_eq!(res, Err(Ok(ValidatorError::InsufficientWeight)));
}

#[test]
fn test_count_valid_signers_ignores_duplicates_and_unknowns() {
    let env = Env::default();
    env.mock_all_auths();
    let (_admin, signers, client) = setup_admin(&env);
    let presented: Vec<Address> = vec![
        &env,
        signers.get_unchecked(0),
        signers.get_unchecked(0),   // duplicate -> counted once
        Address::generate(&env),    // unknown -> ignored
    ];
    assert_eq!(client.count_valid_signers(&presented), 1u32);
}
