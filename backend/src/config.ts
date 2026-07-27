/** Environment configuration with validation. */

export type StellarNetwork = "testnet" | "mainnet" | "futurenet" | "standalone";

const NETWORK_PASSPHRASE_DEFAULTS: Record<StellarNetwork, string> = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
  futurenet: "Test SDF Future Network ; October 2022",
  standalone: "Standalone Network ; February 2017",
};

export interface Config {
  port: number;
  stellarNetwork: StellarNetwork;
  networkPassphrase: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
  sorobanRpcUrls: string[];
  escrowContractId: string;
  lendingPoolContractId: string;
  usdcTokenId: string;
  pinataApiKey: string;
  pinataSecretApiKey: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  webhookSecret: string;
  allowedOrigins: string[];
  adminApiKey: string;
  redisUrl: string | null;
  redisClusterEnabled: boolean;
  redisClusterNodes: string[];
  remittanceCacheTtl: number;
  /** KMS-managed Key Encryption Keys, keyed by rotation version (e.g. "v1", "v2"). */
  kmsKeyVersions: Record<string, string>;
  /** The key version used to wrap newly-generated data keys. Existing files keep unwrapping with the version they were sealed under. */
  kmsActiveKeyVersion: string;
  /** Signing secret for temporary IAM-style KYC document decryption tokens. */
  kycOperatorSecret: string;
  /** Lifetime (seconds) of a temporary KYC decryption access token. */
  kycAccessTokenTtlSeconds: number;
  /** Maximum base fee for Stellar transactions (in stroops). */
  maxStellarBaseFee: number;
  /** Maximum base fee for EVM transactions (in wei). */
  maxEvmBaseFee: number;
  /** Maximum base fee for Solana transactions (in lamports). */
  maxSolanaBaseFee: number;
}

/** Parses KMS_KEY_VERSIONS (a JSON map of version -> 64-hex-char key) with a dev-safe fallback. */
function parseKmsKeyVersions(raw: string | undefined): Record<string, string> {
  const devDefault = { v1: "0".repeat(64) };
  if (!raw) return devDefault;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // fall through to the dev default below
  }
  return devDefault;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || "4000", 10),
    stellarNetwork: (process.env.STELLAR_NETWORK as StellarNetwork) || "testnet",
    networkPassphrase:
      process.env.STELLAR_NETWORK_PASSPHRASE ||
      NETWORK_PASSPHRASE_DEFAULTS[
        (process.env.STELLAR_NETWORK as StellarNetwork) || "testnet"
      ],
    horizonUrl:
      process.env.HORIZON_URL || "https://horizon-testnet.stellar.org",
    sorobanRpcUrl:
      process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
    sorobanRpcUrls: process.env.SOROBAN_RPC_URLS
      ? process.env.SOROBAN_RPC_URLS.split(",").map((url) => url.trim())
      : [process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org"],
    escrowContractId: process.env.ESCROW_CONTRACT_ID || "",
    lendingPoolContractId: process.env.LENDING_POOL_CONTRACT_ID || "",
    usdcTokenId: process.env.USDC_TOKEN_ID || "",
    pinataApiKey: process.env.PINATA_API_KEY || "",
    pinataSecretApiKey: process.env.PINATA_SECRET_API_KEY || "",
    smtpHost: process.env.SMTP_HOST || "localhost",
    smtpPort: parseInt(process.env.SMTP_PORT || "587", 10),
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",
    smtpFrom: process.env.SMTP_FROM || "no-reply@remitmortgage.com",
    webhookSecret: process.env.WEBHOOK_SECRET || "default_signing_secret_key",
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
      : ["http://localhost:3000", "http://localhost:4000"],
    adminApiKey: process.env.ADMIN_API_KEY || "default_admin_api_key",
    redisUrl: process.env.REDIS_URL || null,
    redisClusterEnabled: process.env.REDIS_CLUSTER_ENABLED === "true",
    redisClusterNodes: process.env.REDIS_CLUSTER_NODES
      ? process.env.REDIS_CLUSTER_NODES.split(",").map((n) => n.trim())
      : [],
    remittanceCacheTtl: parseInt(process.env.REMITTANCE_CACHE_TTL || "300", 10),
    kmsKeyVersions: parseKmsKeyVersions(process.env.KMS_KEY_VERSIONS),
    kmsActiveKeyVersion: process.env.KMS_ACTIVE_KEY_VERSION || "v1",
    kycOperatorSecret: process.env.KYC_OPERATOR_SECRET || "default_kyc_operator_secret",
    kycAccessTokenTtlSeconds: parseInt(process.env.KYC_ACCESS_TOKEN_TTL || "300", 10),
    maxStellarBaseFee: parseInt(process.env.MAX_STELLAR_BASE_FEE || "100000", 10),
    maxEvmBaseFee: parseInt(process.env.MAX_EVM_BASE_FEE || "100000000000", 10),
    maxSolanaBaseFee: parseInt(process.env.MAX_SOLANA_BASE_FEE || "10000", 10),
  };
}
