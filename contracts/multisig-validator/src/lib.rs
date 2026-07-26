#![no_std]

mod errors;
mod types;

pub use crate::errors::ValidatorError;
pub use crate::types::{DataKey, MultisigConfig, Proposal, ProposalState, Signer, TimelockConfig};

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Vec};

const INSTANCE_LIFETIME_THRESHOLD: u32 = 129_600; // ~7.5 days
const INSTANCE_BUMP_AMOUNT: u32 = 518_400; // ~30 days

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
    pub fn submit_action(
        env: Env,
        proposal_id: BytesN<32>,
    ) -> Result<(), ValidatorError> {
        let now = env.ledger().timestamp();
        let proposal = Proposal {
            state: ProposalState::Pending,
            ready_at: 0,
            created_at: now,
        };
        env.storage()
            .persistent()
            .set(&DataKey::ActionProposal(proposal_id), &proposal);
        Self::bump_instance(&env);
        Ok(())
    }

    /// Approve a proposal with the given `signing_keys`. Once the cumulative
    /// weight meets the account's threshold, the proposal transitions from
    /// `Pending` to `Locked` and the timelock countdown begins.
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

    /// Execute a timelocked proposal. Fails if not Locked, or if the timelock
    /// delay has not yet elapsed.
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

    /// Contract version.
    pub fn version(_env: Env) -> u32 {
        2
    }
}

#[cfg(test)]
mod test;
