# Reentrancy Guards — Implementation Highlight

**Branch:** `feat/contracts-reentrancy-guards`  
**Scope:** `contracts/escrow`, `contracts/lending-pool`, `contracts/milestone`

---

## What Was Added

### 1. Storage Key (`DataKey::Reentrant`)
Added to the `DataKey` enum in each contract's `types.rs`. Acts as an on-chain boolean mutex stored in instance storage.

| Contract | File |
|---|---|
| escrow | `contracts/escrow/src/types.rs` |
| lending-pool | `contracts/lending-pool/src/types.rs` |
| milestone | `contracts/milestone/src/types.rs` |

### 2. Error Variant (`ReentrancyGuard`)
Added to each contract's error enum. Returned immediately when a reentrant call is detected.

| Contract | Variant | Code |
|---|---|---|
| escrow | `EscrowError::ReentrancyGuard` | `18` |
| lending-pool | `PoolError::ReentrancyGuard` | `17` |
| milestone | `MilestoneError::ReentrancyGuard` | `12` |

### 3. Guard Helper (`non_reentrant`)
Added as a private helper on each contract's internal `impl` block:

```rust
fn non_reentrant<T, F>(env: &Env, f: F) -> Result<T, Error>
where
    F: FnOnce() -> Result<T, Error>,
{
    if env.storage().instance().get(&DataKey::Reentrant).unwrap_or(false) {
        return Err(Error::ReentrancyGuard);
    }
    env.storage().instance().set(&DataKey::Reentrant, &true);
    let result = f();
    env.storage().instance().set(&DataKey::Reentrant, &false);
    result
}
```

Pattern: **check → lock → execute → unlock**. The lock is always cleared after execution, including on error paths (the closure returns `Result`, so the unlock runs unconditionally after `f()`).

### 4. Guarded Functions

| Contract | Function | Risk |
|---|---|---|
| escrow | `deposit` | token transfer in, cross-contract yield vault |
| escrow | `withdraw` | token transfer out |
| escrow | `release` | token transfer out to lending pool |
| lending-pool | `deposit` | token transfer in |
| lending-pool | `withdraw` | token transfer out |
| lending-pool | `disburse` | token transfer out to contractor (called by milestone) |
| milestone | `release_milestone` | cross-contract call → `disburse` on lending pool |

Auth and pause checks run **before** entering the guard (no state mutation needed there).

---

## Tests Added (10 total)

Each contract has tests that:
1. Pre-set `DataKey::Reentrant = true` via `env.as_contract(...)` to simulate a mid-execution reentrant callback
2. Assert the function returns `ReentrancyGuard`
3. Confirm normal execution succeeds when the flag is cleared

| Contract | Tests |
|---|---|
| escrow | `test_deposit_blocked_when_reentrant_flag_set` |
| | `test_withdraw_blocked_when_reentrant_flag_set` |
| | `test_release_blocked_when_reentrant_flag_set` |
| | `test_deposit_succeeds_after_reentrant_flag_cleared` |
| lending-pool | `test_deposit_blocked_when_reentrant_flag_set` |
| | `test_withdraw_blocked_when_reentrant_flag_set` |
| | `test_disburse_blocked_when_reentrant_flag_set` |
| | `test_deposit_succeeds_after_reentrant_flag_cleared` |
| milestone | `test_release_milestone_blocked_when_reentrant_flag_set` |
| | `test_release_milestone_succeeds_when_flag_is_clear` |

---

## Files Changed

```
contracts/escrow/src/types.rs        ← DataKey::Reentrant
contracts/escrow/src/errors.rs       ← ReentrancyGuard = 18
contracts/escrow/src/lib.rs          ← guard helper + wrapped functions + tests

contracts/lending-pool/src/types.rs  ← DataKey::Reentrant
contracts/lending-pool/src/errors.rs ← ReentrancyGuard = 17
contracts/lending-pool/src/lib.rs    ← guard helper + wrapped functions + tests

contracts/milestone/src/types.rs     ← DataKey::Reentrant
contracts/milestone/src/errors.rs    ← ReentrancyGuard = 12
contracts/milestone/src/lib.rs       ← guard helper + wrapped functions + tests
```
