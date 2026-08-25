#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Price,
    DeviationConfig,
    HaltFlag,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PriceData {
    pub price: i128,
    pub updated_ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct DeviationConfig {
    pub max_deviation_bps: u32,
    pub window_ledgers: u32,
}

#[contract]
pub struct OraclePriceContract;

#[contractimpl]
impl OraclePriceContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::HaltFlag, &false);
    }

    pub fn set_deviation_config(env: Env, config: DeviationConfig) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::DeviationConfig, &config);
    }

    pub fn update_price(env: Env, new_price: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let current_ledger = env.ledger().sequence();
        let halt_flag: bool = env.storage().instance().get(&DataKey::HaltFlag).unwrap_or(false);
        
        if halt_flag {
            panic!("Oracle halted");
        }

        let config_opt: Option<DeviationConfig> = env.storage().instance().get(&DataKey::DeviationConfig);
        let last_price_opt: Option<PriceData> = env.storage().instance().get(&DataKey::Price);

        if let (Some(conf), Some(last_price)) = (config_opt, last_price_opt) {
            if current_ledger <= last_price.updated_ledger + conf.window_ledgers {
                if last_price.price > 0 {
                    let diff = if new_price > last_price.price {
                        new_price - last_price.price
                    } else {
                        last_price.price - new_price
                    };

                    let deviation_bps = (diff * 10000) / last_price.price;

                    if deviation_bps > conf.max_deviation_bps as i128 {
                        env.storage().instance().set(&DataKey::HaltFlag, &true);
                        return; // Halt without updating the price
                    }
                }
            }
        }

        env.storage().instance().set(&DataKey::Price, &PriceData { price: new_price, updated_ledger: current_ledger });
    }

    pub fn get_price(env: Env) -> i128 {
        let halt_flag: bool = env.storage().instance().get(&DataKey::HaltFlag).unwrap_or(false);
        if halt_flag {
            panic!("Oracle halted");
        }
        let price_data: PriceData = env.storage().instance().get(&DataKey::Price).unwrap();
        price_data.price
    }

    pub fn is_halted(env: Env) -> bool {
        env.storage().instance().get(&DataKey::HaltFlag).unwrap_or(false)
    }

    pub fn clear_halt(env: Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::HaltFlag, &false);
    }
}
