use soroban_sdk::{contracttype, Address, BytesN};

/// On-chain anchor for a borrower eligibility verification report.
///
/// The sensitive financial dataset itself is kept off-chain; only the
/// cryptographic hash of the report is stored here for auditability.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct VerificationRecord {
    /// The borrower the verification report belongs to.
    pub borrower: Address,
    /// Cryptographic hash of the off-chain verification report.
    pub report_hash: BytesN<32>,
    /// Ledger sequence at which the verification was registered.
    pub verified_ledger: u32,
    /// Ledger sequence after which the verification is considered expired.
    pub expiration_ledger: u32,
    /// Anchored credit score (0–100) from the off-chain verification report.
    pub score: u32,
}

/// Interest rate configuration for dynamic rate calculation.
///
/// Allows the protocol to update interest rates globally without
/// redeploying contracts, adapting to macroeconomic conditions.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RateConfig {
    /// Interest rate for excellent tier (score 80-100) in basis points.
    pub rate_excellent_bps: u32,
    /// Interest rate for good tier (score 60-79) in basis points.
    pub rate_good_bps: u32,
    /// Interest rate for fair tier (score 40-59) in basis points.
    pub rate_fair_bps: u32,
    /// Fallback rate when verification is missing/expired, in basis points.
    pub rate_fallback_bps: u32,
}

/// Storage keys for the verification registry contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Contract admin address.
    Admin,
    /// Pending admin address awaiting acceptance of the admin role.
    ProposedAdmin,
    /// Verification record keyed by borrower address.
    Verification(Address),
    /// Dynamic interest rate configuration.
    RateConfig,
}
