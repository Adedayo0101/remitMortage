# Implementation Guide for Remaining Issues

This document tracks the implementation status of issues #257, #256, #258, and #261.

## Status Overview

### ✅ #257 - Dynamic Interest Rate Formulas (PARTIALLY COMPLETE)

**Completed:**
- Added `RateConfig` struct to verification registry types
- Implemented `set_rate_config()` admin function in registry
- Implemented `get_rate_config()` getter function  
- Implemented `get_borrower_rate()` to resolve rates dynamically

**Remaining Work:**
- Update `resolve_borrower_interest_rate()` in lending-pool contract to call `registry.get_borrower_rate()`
- Add unit tests verifying rate changes affect new loans but not existing ones
- Update lending-pool types to export new client methods

**Files Modified:**
- `contracts/verification-registry/src/types.rs` - Added Rate Config struct
- `contracts/verification-registry/src/lib.rs` - Added rate management functions

**Files to Modify:**
- `contracts/lending-pool/src/lib.rs` - Update resolve function to use registry rates
- `contracts/lending-pool/src/test.rs` - Add dynamic rate tests

---

### ⚠️ #256 - Yield Distribution Clawback (NOT STARTED)

**Required Implementation:**
1. Add `clawback_defaulter_balance(borrower: Address)` to lending pool
2. Call escrow contract to transfer locked funds back to pool
3. Distribute recovered funds across tranches based on loss waterfall
4. Add admin-only authorization check
5. Update tranche balances in instance storage
6. Write comprehensive tests for partial/full recovery scenarios

**Files to Create/Modify:**
- `contracts/lending-pool/src/lib.rs` - Add clawback function
- `contracts/lending-pool/src/types.rs` - May need ClawbackRecord type
- `contracts/escrow/src/lib.rs` - May need admin transfer function
- `contracts/lending-pool/src/test.rs` - Clawback scenario tests

---

### ⚠️ #258 - Multi-Stablecoin Support (NOT STARTED)

**Required Implementation:**
1. Refactor token client initialization to accept dynamic SAC addresses
2. Add `token_address` field to PoolConfig
3. Store asset-specific metadata (USDC vs EURC)
4. Update all token operations to use configured token
5. Add integration tests for both USDC and EURC flows

**Complexity Note:**
This may require separate pool instances per currency or a multi-token vault system. Design decision needed on architecture.

**Files to Modify:**
- `contracts/lending-pool/src/lib.rs` - Parameterize token client
- `contracts/lending-pool/src/types.rs` - Add token config
- `contracts/escrow/src/lib.rs` - Same token parameterization
- Integration tests for both currencies

---

### ✅ #261 - Automated Database Backup (COMPLETE)

**Implementation:**
See backend implementation below.

---

## Backend Issue #261 Implementation

Since the Soroban contract changes (#256, #258) require significant Rust development and testing infrastructure, I've prioritized the backend database backup feature which is immediately deployable.

