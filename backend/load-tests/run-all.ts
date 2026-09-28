/**
 * Load Test Suite Orchestrator
 *
 * Runs all scenarios sequentially and prints a consolidated summary table.
 * Exit code 0 = all passed, 1 = one or more scenarios breached a threshold.
 *
 * Usage:
 *   npx tsx load-tests/run-all.ts
 *
 * Configuration via environment variables (see load-tests/config.ts):
 *   BASE_URL            API base URL (default: http://localhost:4000)
 *   ADMIN_API_KEY       Admin bearer token (default: default_admin_api_key)
 *   AUTH_TOKEN          JWT for authenticated loan routes (optional)
 *   LOAD_CONNECTIONS    Concurrent virtual users (default: 10)
 *   LOAD_DURATION       Test duration in seconds (default: 20)
 *   LOAD_PIPELINING     HTTP pipelining factor (default: 1)
 *   LOAD_P99_THRESHOLD_MS  p99 failure threshold ms (default: 500)
 *   LOAD_MAX_ERROR_RATE    Error rate failure threshold 0-1 (default: 0.01)
 *
 * Each scenario is independent — a failure in one does not abort the others
 * so the full suite always produces a complete picture.
 */

import { loadConfig } from "./config.js";
import { runScenario, printFinalSummary } from "./runner.js";
import type { ScenarioResult } from "./runner.js";

// ── Test addresses (valid Stellar public keys, no real on-chain history) ──
const WRITE_ADDRESSES = [
  "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBMH6AND4ES3",
  "GBSOLVUQZWJHKM24FH4FKX3LKMM3NBVGSAZJXF7GBZJRGQKBQZ7DYFQ",
  "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGKIUBT5ZWGEJLM6HE3X",
  "GDDQMLB65QS7VXI2OQJR5AEKL4MNPGC5XBKBLGGMZSDL6KN74RYMCV",
  "GDZNKOOKLBX7AGWG2RM7FDVVTLZMJXBDATQHZ5YTJYESGPBR6EPIZBV",
];

function verifyBody(address: string): string {
  return JSON.stringify({ senderAddress: address, recipientAddress: address });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const results: ScenarioResult[] = [];

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║       RemitMortgage — PostgreSQL Persistence Load Suite      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`  Base URL    : ${config.baseUrl}`);
  console.log(`  Connections : ${config.connections} virtual users`);
  console.log(`  Duration    : ${config.duration}s per scenario`);
  console.log(`  Pipelining  : ${config.pipelining}`);
  console.log(`  p99 ceiling : ${config.p99ThresholdMs}ms`);
  console.log(`  Max errors  : ${(config.maxErrorRate * 100).toFixed(1)}%\n`);

  const adminHeader = { Authorization: `Bearer ${config.adminApiKey}` };
  const jsonHeader = { "Content-Type": "application/json" };
  const authToken = process.env.AUTH_TOKEN;
  const loanAuthHeader = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  // ── 1. Health baseline ─────────────────────────────────────────────────
  results.push(
    await runScenario({
      title: "Health Read (GET /api/health)",
      config,
      instanceOptions: {
        url: `${config.baseUrl}/api/health`,
        method: "GET",
      },
    })
  );

  // ── 2. Audit log paginated read ────────────────────────────────────────
  results.push(
    await runScenario({
      title: "Audit Log Read (GET /api/audit-logs)",
      config,
      instanceOptions: {
        url: config.baseUrl,
        headers: adminHeader,
        requests: [
          { path: "/api/audit-logs?limit=20", method: "GET" as const, headers: adminHeader },
          { path: "/api/audit-logs?limit=20&action=verification.check", method: "GET" as const, headers: adminHeader },
          { path: "/api/audit-logs?limit=50", method: "GET" as const, headers: adminHeader },
          { path: "/api/audit-logs?limit=20&action=milestone.proposal_created", method: "GET" as const, headers: adminHeader },
        ],
      },
    })
  );

  // ── 3. Analytics cached read ───────────────────────────────────────────
  results.push(
    await runScenario({
      title: "Analytics Read (GET /api/analytics/*)",
      config,
      instanceOptions: {
        url: config.baseUrl,
        requests: [
          { path: "/api/analytics/overview", method: "GET" as const },
          { path: "/api/analytics/loans", method: "GET" as const },
          { path: "/api/analytics/disbursement", method: "GET" as const },
          { path: "/api/analytics/volume?months=6", method: "GET" as const },
        ],
      },
    })
  );

  // ── 4. Loan status indexed read ────────────────────────────────────────
  const loanRequests = authToken
    ? [
        { path: "/api/loan/pending", method: "GET" as const, headers: loanAuthHeader },
        {
          path: "/api/loan/borrower/GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBMH6AND4ES3",
          method: "GET" as const,
          headers: loanAuthHeader,
        },
      ]
    : [{ path: "/api/health", method: "GET" as const }];

  results.push(
    await runScenario({
      title: authToken
        ? "Loan Status Read (GET /api/loan/pending)"
        : "Loan Status Read (fallback: GET /api/health — set AUTH_TOKEN to run real queries)",
      config,
      instanceOptions: {
        url: config.baseUrl,
        requests: loanRequests,
      },
    })
  );

  // ── 5. Verification write (upsert + insert) ────────────────────────────
  results.push(
    await runScenario({
      title: "Verification Write (POST /api/verification/check)",
      config,
      instanceOptions: {
        url: config.baseUrl,
        requests: WRITE_ADDRESSES.map((address) => ({
          path: "/api/verification/check",
          method: "POST" as const,
          headers: jsonHeader,
          body: verifyBody(address),
        })),
      },
    })
  );

  // ── 6. Mixed workload (70 % reads / 30 % writes) ───────────────────────
  results.push(
    await runScenario({
      title: "Mixed Workload (70% reads / 30% writes)",
      config,
      instanceOptions: {
        url: config.baseUrl,
        requests: [
          { path: "/api/health", method: "GET" as const },
          { path: "/api/audit-logs?limit=20", method: "GET" as const, headers: adminHeader },
          { path: "/api/analytics/overview", method: "GET" as const },
          { path: "/api/audit-logs?limit=50", method: "GET" as const, headers: adminHeader },
          { path: "/api/analytics/loans", method: "GET" as const },
          { path: "/api/health", method: "GET" as const },
          { path: "/api/analytics/disbursement", method: "GET" as const },
          {
            path: "/api/verification/check",
            method: "POST" as const,
            headers: jsonHeader,
            body: verifyBody(WRITE_ADDRESSES[0]),
          },
          {
            path: "/api/verification/check",
            method: "POST" as const,
            headers: jsonHeader,
            body: verifyBody(WRITE_ADDRESSES[1]),
          },
          {
            path: "/api/verification/check",
            method: "POST" as const,
            headers: jsonHeader,
            body: verifyBody(WRITE_ADDRESSES[2]),
          },
        ],
      },
    })
  );

  // ── Final summary ──────────────────────────────────────────────────────
  const exitCode = printFinalSummary(results);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Load test suite crashed:", err);
  process.exit(1);
});
