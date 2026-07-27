#![no_std]

mod errors;
mod types;

use crate::errors::RegistryError;
use crate::types::{DataKey, RateConfig, RiskRecord, RiskTier, VerificationRecord};
use soroban_sdk::{contract, contractimpl, symbol_short, Address, BytesN, Env};

const INSTANCE_BUMP_AMOUNT: u32 = 518_400; // ~30 days
const INSTANCE_LIFETIME_THRESHOLD: u32 = 129_600; // ~7.5 days

const PERSISTENT_BUMP_AMOUNT: u32 = 518_400; // ~30 days
const PERSISTENT_LIFETIME_THRESHOLD: u32 = 129_600; // ~7.5 days

/// Verification Registry Contract
///
/// Acts as an on-chain anchor for borrower eligibility verification
/// reports. Rather than storing sensitive financial datasets on-chain,
/// only the cryptographic hash of each report is anchored here, allowing
/// third parties to audit that a borrower was verified without exposing
/// the underlying data.
#[contract]
pub struct VerificationRegistryContract;

/// Internal helpers.
impl VerificationRegistryContract {
    fn read_admin(env: &Env) -> Result<Address, RegistryError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(RegistryError::NotInitialized)
    }

    fn record_key(borrower: &Address) -> DataKey {
        DataKey::Verification(borrower.clone())
    }

    fn read_record(env: &Env, borrower: &Address) -> Option<VerificationRecord> {
        let key = Self::record_key(borrower);
        let record: Option<VerificationRecord> = env.storage().persistent().get(&key);
        if record.is_some() {
            env.storage().persistent().extend_ttl(
                &key,
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_BUMP_AMOUNT,
            );
        }
        record
    }

    fn set_record(env: &Env, borrower: &Address, record: &VerificationRecord) {
        let key = Self::record_key(borrower);
        env.storage().persistent().set(&key, record);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
    }

    fn risk_key(borrower: &Address) -> DataKey {
        DataKey::Risk(borrower.clone())
    }

    fn tier_from_score(score: u32) -> RiskTier {
        if score >= 80 {
            RiskTier::Excellent
        } else if score >= 60 {
            RiskTier::Good
        } else if score >= 40 {
            RiskTier::Fair
        } else {
            RiskTier::Poor
        }
    }

    fn read_risk_record(env: &Env, borrower: &Address) -> Option<RiskRecord> {
        let key = Self::risk_key(borrower);
        let record: Option<RiskRecord> = env.storage().persistent().get(&key);
        if record.is_some() {
            env.storage().persistent().extend_ttl(
                &key,
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_BUMP_AMOUNT,
            );
        }
        record
    }

    fn set_risk_record(env: &Env, borrower: &Address, record: &RiskRecord) {
        let key = Self::risk_key(borrower);
        env.storage().persistent().set(&key, record);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
    }

    fn seed_risk_from_score(score: u32) -> RiskRecord {
        RiskRecord {
            score,
            tier: Self::tier_from_score(score),
            consecutive_late: 0,
            on_time_payments: 0,
            late_payments: 0,
        }
    }

    fn read_lending_pool(env: &Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::LendingPool)
    }

    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    }
}

#[contractimpl]
impl VerificationRegistryContract {
    /// Initialize the registry with the admin authorized to anchor reports.
    pub fn initialize(env: Env, admin: Address) -> Result<(), RegistryError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(RegistryError::AlreadyInitialized);
        }

        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("init"),),
            (admin,),
        );

        Ok(())
    }

    /// Anchor a borrower eligibility report hash on-chain.
    ///
    /// Admin-only. The record expires duration_ledgers after the current
    /// ledger; registering again for the same borrower overwrites the
    /// previous record.
    pub fn register_verification(
        env: Env,
        borrower: Address,
        report_hash: BytesN<32>,
        duration_ledgers: u32,
        score: u32,
    ) -> Result<(), RegistryError> {
        let admin = Self::read_admin(&env)?;
        admin.require_auth();

        if duration_ledgers == 0 {
            return Err(RegistryError::InvalidDuration);
        }

        if score > 100 {
            return Err(RegistryError::InvalidScore);
        }

        let zero: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
        if report_hash == zero {
            return Err(RegistryError::InvalidHash);
        }

        let verified_ledger = env.ledger().sequence();
        let record = VerificationRecord {
            borrower: borrower.clone(),
            report_hash,
            verified_ledger,
            expiration_ledger: verified_ledger.saturating_add(duration_ledgers),
            score,
        };

        Self::set_record(&env, &borrower, &record);
        Self::set_risk_record(&env, &borrower, &Self::seed_risk_from_score(score));
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("vreg"),),
            (admin, borrower, score, verified_ledger, record.expiration_ledger),
        );

        Ok(())
    }

    /// Returns 	rue if the borrower has a valid, non-expired verification
    /// record anchored on-chain, and alse otherwise.
    pub fn is_verified(env: Env, borrower: Address) -> bool {
        match Self::read_record(&env, &borrower) {
            Some(record) => env.ledger().sequence() <= record.expiration_ledger,
            None => false,
        }
    }

    /// Fetch the raw verification record for a borrower, if one exists.
    pub fn get_verification(
        env: Env,
        borrower: Address,
    ) -> Result<VerificationRecord, RegistryError> {
        Self::read_record(&env, &borrower).ok_or(RegistryError::VerificationNotFound)
    }

    /// Returns the anchored credit score for a borrower with a valid,
    /// non-expired verification record.
    pub fn get_score(env: Env, borrower: Address) -> Result<u32, RegistryError> {
        let record = Self::read_record(&env, &borrower).ok_or(RegistryError::VerificationNotFound)?;
        if env.ledger().sequence() > record.expiration_ledger {
            return Err(RegistryError::VerificationNotFound);
        }
        Ok(record.score)
    }

    /// Propose a new admin to take over the contract.
    ///
    /// Admin-only. This is the first step of a secure two-step admin
    /// transfer: the proposed admin is recorded but does not gain any
    /// authority until they explicitly call [Self::accept_admin]. Calling
    /// this again overwrites any previously proposed admin, allowing the
    /// current admin to correct a mistake before acceptance.
    pub fn propose_new_admin(env: Env, new_admin: Address) -> Result<(), RegistryError> {
        let admin = Self::read_admin(&env)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::ProposedAdmin, &new_admin);
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("prop_adm"),),
            (admin, new_admin),
        );

        Ok(())
    }

    /// Accept a pending admin proposal, completing the two-step transfer.
    ///
    /// Can only be called by the address previously set via
    /// [Self::propose_new_admin]. On success the caller becomes the new
    /// admin and the pending proposal is cleared, stripping the old admin of
    /// all authority.
    pub fn accept_admin(env: Env) -> Result<(), RegistryError> {
        let proposed: Address = env
            .storage()
            .instance()
            .get(&DataKey::ProposedAdmin)
            .ok_or(RegistryError::NoProposedAdmin)?;
        proposed.require_auth();

        env.storage().instance().set(&DataKey::Admin, &proposed);
        env.storage().instance().remove(&DataKey::ProposedAdmin);
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("acc_adm"),),
            (proposed,),
        );

        Ok(())
    }

    /// Returns the contract version.
    pub fn version(_env: Env) -> u32 {
        1
    }

    /// Set dynamic interest rate configuration.
    ///
    /// Admin-only. Updates the global interest rate tiers that lending pools
    /// query when resolving borrower interest rates. Allows the protocol to
    /// adapt to macroeconomic conditions without redeploying contracts.
    pub fn set_rate_config(
        env: Env,
        rate_excellent_bps: u32,
        rate_good_bps: u32,
        rate_fair_bps: u32,
        rate_fallback_bps: u32,
    ) -> Result<(), RegistryError> {
        let admin = Self::read_admin(&env)?;
        admin.require_auth();

        let config = RateConfig {
            rate_excellent_bps,
            rate_good_bps,
            rate_fair_bps,
            rate_fallback_bps,
        };

        env.storage().instance().set(&DataKey::RateConfig, &config);
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("rate_cfg"),),
            (admin, rate_excellent_bps, rate_good_bps, rate_fair_bps, rate_fallback_bps),
        );

        Ok(())
    }

    /// Get the current dynamic interest rate configuration.
    ///
    /// Returns the rate config if set, or defaults if not yet configured.
    pub fn get_rate_config(env: Env) -> RateConfig {
        env.storage()
            .instance()
            .get(&DataKey::RateConfig)
            .unwrap_or(RateConfig {
                rate_excellent_bps: 400,  // 4% APR
                rate_good_bps: 600,        // 6% APR
                rate_fair_bps: 800,        // 8% APR
                rate_fallback_bps: 1200,   // 12% APR
            })
    }

    /// Resolve the interest rate for a borrower based on their credit score.
    ///
    /// Uses the current rate configuration and the borrower's verification
    /// record. Returns the fallback rate if no valid verification exists.
    pub fn get_borrower_rate(env: Env, borrower: Address) -> u32 {
        let config = Self::get_rate_config(env.clone());

        if let Some(risk) = Self::read_risk_record(&env, &borrower) {
            return match Self::tier_from_score(risk.score) {
                RiskTier::Excellent => config.rate_excellent_bps,
                RiskTier::Good => config.rate_good_bps,
                RiskTier::Fair => config.rate_fair_bps,
                RiskTier::Poor => config.rate_fallback_bps,
            };
        }

        match Self::read_record(&env, &borrower) {
            Some(record) if env.ledger().sequence() <= record.expiration_ledger => {
                let score = record.score;
                if score >= 80 {
                    config.rate_excellent_bps
                } else if score >= 60 {
                    config.rate_good_bps
                } else if score >= 40 {
                    config.rate_fair_bps
                } else {
                    config.rate_fallback_bps
                }
            }
            _ => config.rate_fallback_bps,
        }
    }

    /// Configure the lending pool contract that is allowed to push repayment
    /// callbacks into the registry.
    pub fn set_lending_pool(env: Env, lending_pool: Address) -> Result<(), RegistryError> {
        let admin = Self::read_admin(&env)?;
        admin.require_auth();

        env.storage().instance().set(&DataKey::LendingPool, &lending_pool);
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("set_lp"),),
            (admin, lending_pool),
        );

        Ok(())
    }

    /// Receive a repayment-status callback from the lending pool and update
    /// the borrower's dynamic risk profile.
    pub fn record_repayment_status(
        env: Env,
        borrower: Address,
        was_on_time: bool,
    ) -> Result<RiskRecord, RegistryError> {
        let mut profile = Self::read_risk_record(&env, &borrower)
            .unwrap_or_else(|| Self::seed_risk_from_score(70));

        let old_score = profile.score;

        if was_on_time {
            profile.on_time_payments = profile.on_time_payments.saturating_add(1);
            profile.consecutive_late = 0;
            profile.score = profile.score.saturating_add(4).min(100);
        } else {
            profile.late_payments = profile.late_payments.saturating_add(1);
            profile.consecutive_late = profile.consecutive_late.saturating_add(1);
            let penalty = 10u32.saturating_add(profile.consecutive_late.saturating_mul(5));
            profile.score = profile.score.saturating_sub(penalty);
            if profile.consecutive_late >= 3 {
                profile.score = profile.score.saturating_sub(10);
            }
        }
        profile.tier = Self::tier_from_score(profile.score);
        Self::set_risk_record(&env, &borrower, &profile);
        Self::bump_instance(&env);

        env.events().publish(
            (symbol_short!("risk_upd"),),
            (borrower, old_score, profile.score, was_on_time),
        );

        Ok(profile)
    }

    /// Return the dynamic risk profile, if one exists.
    pub fn get_risk_profile(env: Env, borrower: Address) -> Option<RiskRecord> {
        Self::read_risk_record(&env, &borrower)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events, Ledger as _};
    use soroban_sdk::{Address, BytesN, Env, IntoVal};

    fn setup(env: &Env) -> (Address, VerificationRegistryContractClient<'static>) {
        let admin = Address::generate(env);
        let contract_id = env.register(VerificationRegistryContract, ());
        let client = VerificationRegistryContractClient::new(env, &contract_id);
        client.initialize(&admin);
        (admin, client)
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, _client) = setup(&env);
    }

    #[test]
    fn test_double_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (admin, client) = setup(&env);

        let result = client.try_initialize(&admin);
        assert_eq!(result, Err(Ok(RegistryError::AlreadyInitialized)));
    }

    #[test]
    fn test_register_and_is_verified() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, client) = setup(&env);

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[7u8; 32]);

        client.register_verification(&borrower, &report_hash, &1_000u32, &80u32);

        assert!(client.is_verified(&borrower));

        let record = client.get_verification(&borrower);
        assert_eq!(record.borrower, borrower);
        assert_eq!(record.report_hash, report_hash);
        assert_eq!(record.expiration_ledger, record.verified_ledger + 1_000);
        assert_eq!(record.score, 80u32);
    }

    #[test]
    fn test_register_emits_event() {
        let env = Env::default();
        env.mock_all_auths();
        let (admin, client) = setup(&env);

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[7u8; 32]);

        client.register_verification(&borrower, &report_hash, &1_000u32, &80u32);

        let events = env.events().all();
        let last_event = events.last().unwrap();

        let expected_topic: soroban_sdk::Vec<soroban_sdk::Val> = soroban_sdk::vec![
            &env,
            symbol_short!("vreg").into_val(&env),
        ];
        assert_eq!(last_event.1, expected_topic);

        let (event_admin, event_borrower, event_score, event_ledger, event_expiry): (Address, Address, u32, u32, u32) =
            last_event.2.into_val(&env);
        assert_eq!(event_admin, admin);
        assert_eq!(event_borrower, borrower);
        assert_eq!(event_score, 80u32);
        assert_eq!(event_expiry, event_ledger + 1_000);

        let record = client.get_verification(&borrower);
        assert_eq!(event_ledger, record.verified_ledger);
    }

    #[test]
    fn test_get_score_returns_anchored_score() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, client) = setup(&env);

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[8u8; 32]);

        client.register_verification(&borrower, &report_hash, &500u32, &72u32);
        assert_eq!(client.get_score(&borrower), 72u32);
    }

    #[test]
    fn test_get_score_fails_for_expired_verification() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, client) = setup(&env);

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[8u8; 32]);

        let start = env.ledger().sequence();
        client.register_verification(&borrower, &report_hash, &100u32, &72u32);
        env.ledger().set_sequence_number(start + 101);

        let result = client.try_get_score(&borrower);
        assert_eq!(result, Err(Ok(RegistryError::VerificationNotFound)));
    }

    #[test]
    fn test_register_invalid_score_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, client) = setup(&env);

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[1u8; 32]);

        let result = client.try_register_verification(&borrower, &report_hash, &100u32, &101u32);
        assert_eq!(result, Err(Ok(RegistryError::InvalidScore)));
    }

    #[test]
    fn test_is_verified_false_for_unknown_borrower() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, client) = setup(&env);

        let stranger = Address::generate(&env);
        assert!(!client.is_verified(&stranger));
    }

    #[test]
    fn test_is_verified_false_after_expiration() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, client) = setup(&env);

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[9u8; 32]);

        let start = env.ledger().sequence();
        client.register_verification(&borrower, &report_hash, &100u32, &80u32);
        assert!(client.is_verified(&borrower));

        env.ledger().set_sequence_number(start + 100);
        assert!(client.is_verified(&borrower));

        env.ledger().set_sequence_number(start + 101);
        assert!(!client.is_verified(&borrower));
    }

    #[test]
    fn test_register_zero_duration_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, client) = setup(&env);

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[1u8; 32]);

        let result = client.try_register_verification(&borrower, &report_hash, &0u32, &80u32);
        assert_eq!(result, Err(Ok(RegistryError::InvalidDuration)));
    }

    #[test]
    fn test_register_zero_hash_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, client) = setup(&env);

        let borrower = Address::generate(&env);
        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);

        let result = client.try_register_verification(&borrower, &zero_hash, &100u32, &80u32);
        assert_eq!(result, Err(Ok(RegistryError::InvalidHash)));
    }

    #[test]
    fn test_register_before_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(VerificationRegistryContract, ());
        let client = VerificationRegistryContractClient::new(&env, &contract_id);

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[1u8; 32]);

        let result = client.try_register_verification(&borrower, &report_hash, &100u32, &80u32);
        assert_eq!(result, Err(Ok(RegistryError::NotInitialized)));
    }

    #[test]
    #[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
    fn test_register_requires_admin_auth() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let contract_id = env.register(VerificationRegistryContract, ());
        let client = VerificationRegistryContractClient::new(&env, &contract_id);

        env.mock_all_auths();
        client.initialize(&admin);
        env.set_auths(&[]);

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[1u8; 32]);

        client.register_verification(&borrower, &report_hash, &100u32, &80u32);
    }

    #[test]
    #[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
    fn test_non_admin_register_fails_auth() {
        use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
        use soroban_sdk::IntoVal;

        let env = Env::default();
        let admin = Address::generate(&env);
        let non_admin = Address::generate(&env);

        let contract_id = env.register(VerificationRegistryContract, ());
        let client = VerificationRegistryContractClient::new(&env, &contract_id);

        env.mock_all_auths();
        client.initialize(&admin);

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[1u8; 32]);

        env.mock_auths(&[MockAuth {
            address: &non_admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "register_verification",
                args: (borrower.clone(), report_hash.clone(), 100u32, 80u32).into_val(&env),
                sub_invokes: &[],
            },
        }]);
        client.register_verification(&borrower, &report_hash, &100u32, &80u32);
    }

    #[test]
    fn test_two_step_admin_transfer_flow() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, client) = setup(&env);

        let new_admin = Address::generate(&env);

        client.propose_new_admin(&new_admin);
        client.accept_admin();

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[3u8; 32]);
        client.register_verification(&borrower, &report_hash, &100u32, &80u32);
        assert!(client.is_verified(&borrower));
    }

    #[test]
    fn test_accept_admin_without_proposal_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, client) = setup(&env);

        let result = client.try_accept_admin();
        assert_eq!(result, Err(Ok(RegistryError::NoProposedAdmin)));
    }

    #[test]
    fn test_propose_before_initialize_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(VerificationRegistryContract, ());
        let client = VerificationRegistryContractClient::new(&env, &contract_id);

        let new_admin = Address::generate(&env);
        let result = client.try_propose_new_admin(&new_admin);
        assert_eq!(result, Err(Ok(RegistryError::NotInitialized)));
    }

    #[test]
    #[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
    fn test_only_admin_can_propose() {
        use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
        use soroban_sdk::IntoVal;

        let env = Env::default();
        let admin = Address::generate(&env);
        let non_admin = Address::generate(&env);

        let contract_id = env.register(VerificationRegistryContract, ());
        let client = VerificationRegistryContractClient::new(&env, &contract_id);

        env.mock_all_auths();
        client.initialize(&admin);

        let new_admin = Address::generate(&env);

        env.mock_auths(&[MockAuth {
            address: &non_admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "propose_new_admin",
                args: (new_admin.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }]);
        client.propose_new_admin(&new_admin);
    }

    #[test]
    #[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
    fn test_only_proposed_admin_can_accept() {
        use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
        use soroban_sdk::IntoVal;

        let env = Env::default();
        let admin = Address::generate(&env);
        let new_admin = Address::generate(&env);
        let imposter = Address::generate(&env);

        let contract_id = env.register(VerificationRegistryContract, ());
        let client = VerificationRegistryContractClient::new(&env, &contract_id);

        env.mock_all_auths();
        client.initialize(&admin);
        client.propose_new_admin(&new_admin);

        env.mock_auths(&[MockAuth {
            address: &imposter,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "accept_admin",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }]);
        client.accept_admin();
    }

    #[test]
    #[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
    fn test_old_admin_loses_authority_after_transfer() {
        use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
        use soroban_sdk::IntoVal;

        let env = Env::default();
        let admin = Address::generate(&env);
        let new_admin = Address::generate(&env);

        let contract_id = env.register(VerificationRegistryContract, ());
        let client = VerificationRegistryContractClient::new(&env, &contract_id);

        env.mock_all_auths();
        client.initialize(&admin);
        client.propose_new_admin(&new_admin);
        client.accept_admin();

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[5u8; 32]);

        env.mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "register_verification",
                args: (borrower.clone(), report_hash.clone(), 100u32, 80u32).into_val(&env),
                sub_invokes: &[],
            },
        }]);
        client.register_verification(&borrower, &report_hash, &100u32, &80u32);
    }

    #[test]
    fn test_proposal_can_be_overwritten_before_acceptance() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, client) = setup(&env);

        let first_candidate = Address::generate(&env);
        let second_candidate = Address::generate(&env);

        client.propose_new_admin(&first_candidate);
        client.propose_new_admin(&second_candidate);

        client.accept_admin();

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[6u8; 32]);
        client.register_verification(&borrower, &report_hash, &100u32, &80u32);
        assert!(client.is_verified(&borrower));
    }

    #[test]
    fn test_record_repayment_status_emits_event() {
        let env = Env::default();
        env.mock_all_auths();
        let (_admin, client) = setup(&env);

        let borrower = Address::generate(&env);
        let report_hash = BytesN::from_array(&env, &[10u8; 32]);

        client.register_verification(&borrower, &report_hash, &1_000u32, &70u32);

        client.record_repayment_status(&borrower, &true);

        let events = env.events().all();
        let last_event = events.last().unwrap();

        let expected_topic: soroban_sdk::Vec<soroban_sdk::Val> = soroban_sdk::vec![
            &env,
            symbol_short!("risk_upd").into_val(&env),
        ];
        assert_eq!(last_event.1, expected_topic);

        let (event_borrower, old_score, new_score, was_on_time): (Address, u32, u32, bool) =
            last_event.2.into_val(&env);
        assert_eq!(event_borrower, borrower);
        assert_eq!(old_score, 70u32);
        assert_eq!(new_score, 74u32);
        assert_eq!(was_on_time, true);
    }
}


