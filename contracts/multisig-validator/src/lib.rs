#![no_std]

mod errors;
mod types;

pub use crate::errors::ValidatorError;
pub use crate::types::{DataKey, MultisigConfig, Proposal, ProposalState, Signer, TimelockConfig};

use soroban_sdk::{contract, contractimpl, symbol_short, Address, BytesN, Env, Vec};

const INSTANCE_LIFETIME_THRESHOLD: u32 = 129_600; // ~7.5 days
const INSTANCE_BUMP_AMOUNT: u32 = 518_400; // ~30 days

/// Default proposal lifetime in ledgers when the caller passes 0 at submission.
/// At ~5 seconds per ledger this is approximately 30 days.
#[cfg(not(test))]
const DEFAULT_PROPOSAL_EXPIRY_LEDGERS: u32 = 518_400;
/// Compact default used in tests so expiry can be crossed with small ledger advances.
#[cfg(test)]
const DEFAULT_PROPOSAL_EXPIRY_LEDGERS: u32 = 1_000;

/// Multisig Threshold Validator
///
/// Verifies that the cumulative weight of the signers presented on a proposal
/// meets or exceeds the configured threshold for a multisig account — mirroring
/// Stellar's native multi-signature thresholds (each `signer` carries a
/// `weight`, and an operation is authorized only when the sum of the weights of
/// the signing keys reaches the required threshold).
///
/// Rather than re-implementing per-contract `votes >= threshold` counters, other
/// contracts (e.g. the milestone approval flow) can delegate to this validator
/// so threshold logic lives in one audited place.
#[contract]
pub struct MultisigValidator;

impl MultisigValidator {
    fn read_config(env: &Env, account: &Address) -> Result<MultisigConfig, ValidatorError> {
        env.storage()
            .persistent()
            .get(&DataKey::Config(account.clone()))
            .ok_or(ValidatorError::AccountNotConfigured)
    }

    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    }

    /// Validate a signer set: non-empty, no zero weights, no duplicate keys.
    /// Returns the total configurable weight on success.
    fn validate_signers(signers: &Vec<Signer>) -> Result<u32, ValidatorError> {
        let len = signers.len();
        if len == 0 {
            return Err(ValidatorError::NoSigners);
        }

        let mut total: u32 = 0;
        for i in 0..len {
            let s = signers.get_unchecked(i);
            if s.weight == 0 {
                return Err(ValidatorError::InvalidWeight);
            }
            // Reject duplicate keys.
            for j in (i + 1)..len {
                if signers.get_unchecked(j).key == s.key {
                    return Err(ValidatorError::DuplicateSigner);
                }
            }
            total = total.saturating_add(s.weight);
        }
        Ok(total)
    }

    /// Look up the configured weight of a single key, or `None` if not a signer.
    fn weight_of(config: &MultisigConfig, key: &BytesN<32>) -> Option<u32> {
        let signers = &config.signers;
        for i in 0..signers.len() {
            let s = signers.get_unchecked(i);
            if &s.key == key {
                return Some(s.weight);
            }
        }
        None
    }

    /// Return `true` when the current ledger sequence has passed the proposal's
    /// `expiration_ledger`.
    ///
    /// A value of `0` means the field was not set (legacy record) — treated as
    /// non-expiring to preserve backwards compatibility.
    fn is_expired(env: &Env, proposal: &Proposal) -> bool {
        if proposal.expiration_ledger == 0 {
            return false; // legacy / no-expiry
        }
        env.ledger().sequence() > proposal.expiration_ledger
    }
}

#[contractimpl]
impl MultisigValidator {
    /// Register (or re-register) a multisig account's weighted signer set and
    /// required threshold. The account itself must authorize the registration,
    /// matching the native model where only the account can change its signers.
    ///
    /// The threshold must be achievable: `0 < threshold <= sum(weights)`.
    pub fn configure_account(
        env: Env,
        account: Address,
        signers: Vec<Signer>,
        threshold: u32,
    ) -> Result<(), ValidatorError> {
        account.require_auth();

        let total_weight = Self::validate_signers(&signers)?;
        if threshold == 0 || threshold > total_weight {
            return Err(ValidatorError::InvalidThreshold);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Config(account.clone()), &MultisigConfig { signers, threshold });
        Self::bump_instance(&env);
        Ok(())
    }

    /// Returns the cumulative weight of `signing_keys` against the account's
    /// configured signer set, **trapping** if a key is unknown or appears twice.
    ///
    /// Used internally by `verify_threshold`/`enforce_threshold`; exposed so
    /// callers can inspect a tally.
    pub fn tally_weight(
        env: Env,
        account: Address,
        signing_keys: Vec<BytesN<32>>,
    ) -> Result<u32, ValidatorError> {
        let config = Self::read_config(&env, &account)?;

        let len = signing_keys.len();
        let mut total: u32 = 0;
        for i in 0..len {
            let key = signing_keys.get_unchecked(i);

            // Reject duplicate presented keys (no double-counting weight).
            for j in (i + 1)..len {
                if signing_keys.get_unchecked(j) == key {
                    return Err(ValidatorError::DuplicateSigner);
                }
            }

            match Self::weight_of(&config, &key) {
                Some(w) => total = total.saturating_add(w),
                None => return Err(ValidatorError::UnknownSigner),
            }
        }
        Ok(total)
    }

    /// Returns `true` iff the cumulative weight of `signing_keys` meets or
    /// exceeds the account's configured threshold. Traps on unknown/duplicate
    /// keys (a malformed signature set is an error, not a `false`).
    pub fn verify_threshold(
        env: Env,
        account: Address,
        signing_keys: Vec<BytesN<32>>,
    ) -> Result<bool, ValidatorError> {
        let config = Self::read_config(&env, &account)?;
        let total = Self::tally_weight(env, account, signing_keys)?;
        Ok(total >= config.threshold)
    }

    /// Like `verify_threshold` but returns an `InsufficientWeight` error instead
    /// of `false`. Convenient for callers that want a single `?`-propagatable
    /// gate before approving a proposal/milestone.
    pub fn enforce_threshold(
        env: Env,
        account: Address,
        signing_keys: Vec<BytesN<32>>,
    ) -> Result<(), ValidatorError> {
        if Self::verify_threshold(env, account, signing_keys)? {
            Ok(())
        } else {
            Err(ValidatorError::InsufficientWeight)
        }
    }

    /// Returns the configured threshold for an account.
    pub fn get_threshold(env: Env, account: Address) -> Result<u32, ValidatorError> {
        Ok(Self::read_config(&env, &account)?.threshold)
    }

    /// Returns the full multisig configuration for an account.
    pub fn get_config(env: Env, account: Address) -> Result<MultisigConfig, ValidatorError> {
        Self::read_config(&env, &account)
    }

    /// Returns the total configurable signer weight for an account.
    pub fn total_weight(env: Env, account: Address) -> Result<u32, ValidatorError> {
        let config = Self::read_config(&env, &account)?;
        Self::validate_signers(&config.signers)
    }

    // ── Timelock ───────────────────────────────────────────────────────────────

    /// Configure the timelock delay for `account`. The account itself must
    /// authorize. A delay of 0 disables the timelock (immediate execution).
    pub fn configure_timelock(
        env: Env,
        account: Address,
        delay_seconds: u64,
    ) -> Result<(), ValidatorError> {
        account.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::TimelockConfig(account), &TimelockConfig { delay_seconds });
        Self::bump_instance(&env);
        Ok(())
    }

    /// Return the configured timelock delay for `account`.
    pub fn get_timelock(env: Env, account: Address) -> Result<TimelockConfig, ValidatorError> {
        env.storage()
            .persistent()
            .get(&DataKey::TimelockConfig(account))
            .ok_or(ValidatorError::TimelockNotConfigured)
    }

    /// Submit a new action proposal. `proposal_id` should be a unique 32-byte
    /// value (e.g. a hash of the action details). Anyone may submit.
    ///
    /// # Arguments
    /// - `proposal_id`       — Unique 32-byte identifier (e.g. SHA-256 of action details).
    /// - `expiration_ledger` — Ledger sequence number after which the proposal is
    ///   considered expired and eligible for pruning.  Pass `0` to use the
    ///   protocol default (`DEFAULT_PROPOSAL_EXPIRY_LEDGERS` from the current
    ///   ledger sequence).
    pub fn submit_action(
        env: Env,
        proposal_id: BytesN<32>,
        expiration_ledger: u32,
    ) -> Result<(), ValidatorError> {
        let now = env.ledger().timestamp();
        let current_seq = env.ledger().sequence();

        let effective_expiry = if expiration_ledger == 0 {
            current_seq.saturating_add(DEFAULT_PROPOSAL_EXPIRY_LEDGERS)
        } else {
            expiration_ledger
        };

        let proposal = Proposal {
            state: ProposalState::Pending,
            ready_at: 0,
            created_at: now,
            expiration_ledger: effective_expiry,
        };
        env.storage()
            .persistent()
            .set(&DataKey::ActionProposal(proposal_id.clone()), &proposal);

        env.events().publish(
            (symbol_short!("submitted"),),
            (proposal_id, effective_expiry),
        );

        Self::bump_instance(&env);
        Ok(())
    }

    /// Approve a proposal with the given `signing_keys`. Once the cumulative
    /// weight meets the account's threshold, the proposal transitions from
    /// `Pending` to `Locked` and the timelock countdown begins.
    ///
    /// Returns `ProposalExpired` when the current ledger sequence has passed
    /// the proposal's `expiration_ledger`.
    pub fn approve_action(
        env: Env,
        account: Address,
        proposal_id: BytesN<32>,
        signing_keys: Vec<BytesN<32>>,
    ) -> Result<(), ValidatorError> {
        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::ActionProposal(proposal_id.clone()))
            .ok_or(ValidatorError::ProposalNotFound)?;

        if proposal.state == ProposalState::Executed {
            return Err(ValidatorError::ProposalAlreadyExecuted);
        }

        // Reject votes on expired proposals before any other state check.
        if Self::is_expired(&env, &proposal) {
            return Err(ValidatorError::ProposalExpired);
        }

        // Already locked — no-op.
        if proposal.state == ProposalState::Locked {
            return Ok(());
        }

        // Check threshold via existing logic.
        Self::enforce_threshold(env.clone(), account.clone(), signing_keys)?;

        // Threshold met. Fetch timelock config and set ready_at.
        let timelock = Self::get_timelock(env.clone(), account.clone())?;
        let now = env.ledger().timestamp();
        proposal.state = ProposalState::Locked;
        proposal.ready_at = now.saturating_add(timelock.delay_seconds);

        env.storage()
            .persistent()
            .set(&DataKey::ActionProposal(proposal_id), &proposal);
        Self::bump_instance(&env);
        Ok(())
    }

    /// Returns `true` if the proposal has been approved and the timelock delay
    /// has elapsed. Returns `false` if pending, locked-but-not-ready, or
    /// already executed.
    pub fn can_execute(env: Env, proposal_id: BytesN<32>) -> Result<bool, ValidatorError> {
        let proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::ActionProposal(proposal_id))
            .ok_or(ValidatorError::ProposalNotFound)?;

        match proposal.state {
            ProposalState::Locked => Ok(env.ledger().timestamp() >= proposal.ready_at),
            ProposalState::Executed => Ok(false),
            ProposalState::Pending => Ok(false),
        }
    }

    /// Execute a timelocked proposal. Fails if not Locked, if the timelock
    /// delay has not yet elapsed, or if the proposal has expired.
    pub fn execute_action(
        env: Env,
        proposal_id: BytesN<32>,
    ) -> Result<(), ValidatorError> {
        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::ActionProposal(proposal_id.clone()))
            .ok_or(ValidatorError::ProposalNotFound)?;

        if proposal.state == ProposalState::Executed {
            return Err(ValidatorError::ProposalAlreadyExecuted);
        }
        if proposal.state != ProposalState::Locked {
            return Err(ValidatorError::NotYetApproved);
        }

        // A Locked proposal that somehow crosses its expiry without being
        // executed is also blocked — the approval window has closed.
        if Self::is_expired(&env, &proposal) {
            return Err(ValidatorError::ProposalExpired);
        }

        let now = env.ledger().timestamp();
        if now < proposal.ready_at {
            return Err(ValidatorError::TimelockNotElapsed);
        }

        proposal.state = ProposalState::Executed;
        env.storage()
            .persistent()
            .set(&DataKey::ActionProposal(proposal_id), &proposal);
        Self::bump_instance(&env);
        Ok(())
    }

    /// Read a proposal's current state.
    pub fn get_proposal(env: Env, proposal_id: BytesN<32>) -> Result<Proposal, ValidatorError> {
        env.storage()
            .persistent()
            .get(&DataKey::ActionProposal(proposal_id))
            .ok_or(ValidatorError::ProposalNotFound)
    }

    /// Returns `true` when the given proposal exists and its expiration ledger
    /// has been passed.  Returns `false` when the proposal is non-expiring
    /// (legacy `expiration_ledger == 0`) or still within its window.
    /// Returns `ProposalNotFound` when the ID is not in storage.
    pub fn is_proposal_expired(
        env: Env,
        proposal_id: BytesN<32>,
    ) -> Result<bool, ValidatorError> {
        let proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::ActionProposal(proposal_id))
            .ok_or(ValidatorError::ProposalNotFound)?;
        Ok(Self::is_expired(&env, &proposal))
    }

    /// Remove expired proposals from persistent storage, reclaiming ledger
    /// storage rent.
    ///
    /// Iterates over every ID in `proposal_ids`.  For each entry:
    ///   - If the proposal does not exist in storage it is silently skipped.
    ///   - If the proposal exists but has **not** expired, the function returns
    ///     `ProposalNotExpired` immediately (no partial pruning for that entry,
    ///     but already-pruned entries in the same call are not rolled back).
    ///   - If the proposal is expired it is removed from storage and a
    ///     `pruned` event is emitted.
    ///
    /// Anyone may call this function; no authorization is required because
    /// removing stale storage is always safe and benefits all participants.
    ///
    /// Returns the number of entries successfully pruned.
    pub fn prune_expired_proposals(
        env: Env,
        proposal_ids: Vec<BytesN<32>>,
    ) -> Result<u32, ValidatorError> {
        let mut pruned: u32 = 0;

        for i in 0..proposal_ids.len() {
            let pid = proposal_ids.get_unchecked(i);
            let key = DataKey::ActionProposal(pid.clone());

            let maybe: Option<Proposal> = env.storage().persistent().get(&key);

            match maybe {
                None => {
                    // Already gone — skip silently.
                }
                Some(proposal) => {
                    if !Self::is_expired(&env, &proposal) {
                        // Proposal is still live — refuse to prune it.
                        return Err(ValidatorError::ProposalNotExpired);
                    }
                    env.storage().persistent().remove(&key);
                    env.events().publish(
                        (symbol_short!("pruned"),),
                        (pid, proposal.expiration_ledger),
                    );
                    pruned = pruned.saturating_add(1);
                }
            }
        }

        Self::bump_instance(&env);
        Ok(pruned)
    }

    /// Contract version.
    pub fn version(_env: Env) -> u32 {
        2
    }
}

#[cfg(test)]
mod test;
