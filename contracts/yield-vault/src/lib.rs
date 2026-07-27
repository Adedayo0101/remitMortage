#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol,
};

/// Ledger constant for compound/year calculations (6 months = 518,400 ledgers, 1 year = 1,036,800 ledgers).
const LEDGERS_PER_YEAR: u64 = 1_036_800;
const BPS_SCALE: u128 = 10_000;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    ApyBps,
    TotalShares,
    TotalAssets,
    LastAccrualLedger,
    ShareBalance(Address),
}

#[contract]
pub struct YieldVaultContract;

#[contractimpl]
impl YieldVaultContract {
    /// Initialize the yield vault with a underlying token and annual yield (in bps, e.g. 500 = 5% APY).
    pub fn initialize(env: Env, admin: Address, token: Address, apy_bps: u32) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::ApyBps, &apy_bps);
        env.storage().instance().set(&DataKey::TotalShares, &0i128);
        env.storage().instance().set(&DataKey::TotalAssets, &0i128);
        env.storage()
            .instance()
            .set(&DataKey::LastAccrualLedger, &env.ledger().sequence());
    }

    /// Accrue interest based on elapsed ledgers since last accrual.
    pub fn accrue_interest(env: &Env) {
        let current_ledger = env.ledger().sequence();
        let last_ledger: u32 = env
            .storage()
            .instance()
            .get(&DataKey::LastAccrualLedger)
            .unwrap_or(current_ledger);

        if current_ledger <= last_ledger {
            return;
        }

        let elapsed = (current_ledger - last_ledger) as u64;
        let mut total_assets: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalAssets)
            .unwrap_or(0);
        let apy_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ApyBps)
            .unwrap_or(0);

        if total_assets > 0 && apy_bps > 0 && elapsed > 0 {
            // interest = (total_assets * apy_bps * elapsed) / (10,000 * LEDGERS_PER_YEAR)
            let interest = (total_assets as u128)
                .saturating_mul(apy_bps as u128)
                .saturating_mul(elapsed as u128)
                / (BPS_SCALE * LEDGERS_PER_YEAR as u128);

            total_assets += interest as i128;
            env.storage()
                .instance()
                .set(&DataKey::TotalAssets, &total_assets);
        }

        env.storage()
            .instance()
            .set(&DataKey::LastAccrualLedger, &current_ledger);
    }

    /// Deposit USDC tokens from `from` address and mint vault shares.
    /// Interface expected by EscrowContract: `deposit(from: Address, amount: i128) -> i128`
    pub fn deposit(env: Env, from: Address, amount: i128) -> i128 {
        from.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        Self::accrue_interest(&env);

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);

        let total_shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares)
            .unwrap_or(0);
        let total_assets: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalAssets)
            .unwrap_or(0);

        let shares = if total_shares == 0 || total_assets == 0 {
            amount
        } else {
            (amount as u128)
                .saturating_mul(total_shares as u128)
                / (total_assets as u128) as i128
        };

        if shares <= 0 {
            panic!("shares minted must be positive");
        }

        // Transfer underlying token from caller to vault
        token_client.transfer(&from, &env.current_contract_address(), &amount);

        // Update balances and totals
        let new_total_shares = total_shares + shares;
        let new_total_assets = total_assets + amount;

        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &new_total_shares);
        env.storage()
            .instance()
            .set(&DataKey::TotalAssets, &new_total_assets);

        let caller_shares: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::ShareBalance(from.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::ShareBalance(from.clone()), &(caller_shares + shares));

        env.events().publish(
            (symbol_short!("deposit"), from.clone()),
            (amount, shares),
        );

        shares
    }

    /// Withdraw shares and receive underlying USDC tokens (plus accrued yield).
    /// Interface expected by EscrowContract: `withdraw(to: Address, shares: i128) -> i128`
    pub fn withdraw(env: Env, to: Address, shares: i128) -> i128 {
        to.require_auth();
        if shares <= 0 {
            panic!("shares must be positive");
        }

        Self::accrue_interest(&env);

        let total_shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares)
            .unwrap_or(0);
        let total_assets: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalAssets)
            .unwrap_or(0);

        if shares > total_shares {
            panic!("insufficient vault shares");
        }

        let amount = (shares as u128)
            .saturating_mul(total_assets as u128)
            / (total_shares as u128) as i128;

        let new_total_shares = total_shares - shares;
        let new_total_assets = total_assets - amount;

        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &new_total_shares);
        env.storage()
            .instance()
            .set(&DataKey::TotalAssets, &new_total_assets);

        let caller_shares: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::ShareBalance(to.clone()))
            .unwrap_or(0);
        if caller_shares < shares {
            panic!("insufficient share balance");
        }
        env.storage()
            .persistent()
            .set(&DataKey::ShareBalance(to.clone()), &(caller_shares - shares));

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);

        // Mint extra tokens directly to vault if vault balance is less than `amount` due to simulated interest
        let vault_balance = token_client.balance(&env.current_contract_address());
        if vault_balance < amount {
            let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
            let sac = token::StellarAssetClient::new(&env, &token_addr);
            sac.mint(&env.current_contract_address(), &(amount - vault_balance));
        }

        // Transfer underlying token + yield from vault to recipient `to`
        token_client.transfer(&env.current_contract_address(), &to, &amount);

        env.events().publish(
            (symbol_short!("withdraw"), to.clone()),
            (shares, amount),
        );

        amount
    }

    /// Read current share balance of an address.
    pub fn get_shares(env: Env, account: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::ShareBalance(account))
            .unwrap_or(0)
    }

    /// Read total assets managed by vault (including accrued interest).
    pub fn get_total_assets(env: Env) -> i128 {
        Self::accrue_interest(&env);
        env.storage()
            .instance()
            .get(&DataKey::TotalAssets)
            .unwrap_or(0)
    }

    /// Read total shares minted.
    pub fn get_total_shares(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalShares)
            .unwrap_or(0)
    }

    /// Convert share amount to underlying token value.
    pub fn convert_to_assets(env: Env, shares: i128) -> i128 {
        Self::accrue_interest(&env);
        let total_shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares)
            .unwrap_or(0);
        let total_assets: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalAssets)
            .unwrap_or(0);

        if total_shares == 0 {
            shares
        } else {
            (shares as u128)
                .saturating_mul(total_assets as u128)
                / (total_shares as u128) as i128
        }
    }
}
