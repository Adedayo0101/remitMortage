/**
 * Shared configuration for all load-test scenarios.
 *
 * All values are overridable via environment variables so CI pipelines
 * and local developers can tune the load without touching the scripts.
 */

export interface LoadTestConfig {
  /** API base URL (no trailing slash) */
  baseUrl: string;
  /** Admin Bearer token for protected endpoints */
  adminApiKey: string;
  /** Concurrent connections (virtual users) */
  connections: number;
  /** Test duration in seconds */
  duration: number;
  /** HTTP pipelining factor (1 = no pipelining) */
  pipelining: number;
  /** p99 latency threshold in ms — suite fails if exceeded */
  p99ThresholdMs: number;
  /** Maximum acceptable error rate (0–1) — suite fails if exceeded */
  maxErrorRate: number;
}

export function loadConfig(): LoadTestConfig {
  return {
    baseUrl: process.env.BASE_URL ?? "http://localhost:4000",
    adminApiKey: process.env.ADMIN_API_KEY ?? "default_admin_api_key",
    connections: parseInt(process.env.LOAD_CONNECTIONS ?? "10", 10),
    duration: parseInt(process.env.LOAD_DURATION ?? "20", 10),
    pipelining: parseInt(process.env.LOAD_PIPELINING ?? "1", 10),
    p99ThresholdMs: parseInt(process.env.LOAD_P99_THRESHOLD_MS ?? "500", 10),
    maxErrorRate: parseFloat(process.env.LOAD_MAX_ERROR_RATE ?? "0.01"),
  };
}
