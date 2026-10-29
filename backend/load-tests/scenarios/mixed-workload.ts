/**
 * Scenario: mixed-workload
 *
 * Simulates a realistic 70 % read / 30 % write traffic mix under full
 * concurrency.  This is the most representative scenario for production
 * workload because both read and write connections compete for the same
 * PostgreSQL connection pool slots simultaneously.
 *
 * Request mix (7 read : 3 write ratio):
 *   GET  /api/health                  — DB ping (read)
 *   GET  /api/audit-logs?limit=20     — paginated index-scan (read)
 *   GET  /api/analytics/overview      — cached aggregate (read)
 *   GET  /api/audit-logs?limit=50     — larger paginated scan (read)
 *   GET  /api/analytics/loans         — cached aggregate (read)
 *   GET  /api/health                  — DB ping (read, duplicate weight)
 *   GET  /api/analytics/disbursement  — cached aggregate (read)
 *   POST /api/verification/check (addr A)  — upsert + insert (write)
 *   POST /api/verification/check (addr B)  — upsert + insert (write)
 *   POST /api/verification/check (addr C)  — upsert + insert (write)
 *
 * autocannon cycles through the `requests` array in round-robin order,
 * so the 10-entry list naturally delivers a 70/30 split.
 *
 * Metrics captured:
 *   - Request latency (p50/p95/p99/max)
 *   - Throughput (req/s, bytes/s)
 *   - Error rate (non-2xx + timeouts)
 */

import { loadConfig } from "../config.js";
import { runScenario } from "../runner.js";

const WRITE_ADDRESSES = [
  "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBMH6AND4ES3",
  "GBSOLVUQZWJHKM24FH4FKX3LKMM3NBVGSAZJXF7GBZJRGQKBQZ7DYFQ",
  "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGKIUBT5ZWGEJLM6HE3X",
];

function verifyBody(address: string): string {
  return JSON.stringify({ senderAddress: address, recipientAddress: address });
}

const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "default_admin_api_key";
const adminHeader = { Authorization: `Bearer ${ADMIN_KEY}` };
const jsonHeader = { "Content-Type": "application/json" };

async function main(): Promise<void> {
  const config = loadConfig();

  await runScenario({
    title: "Mixed Workload (70% reads / 30% writes)",
    config,
    instanceOptions: {
      url: config.baseUrl,
      requests: [
        // ── reads (7 slots) ───────────────────────────────────────────────
        {
          path: "/api/health",
          method: "GET" as const,
        },
        {
          path: "/api/audit-logs?limit=20",
          method: "GET" as const,
          headers: adminHeader,
        },
        {
          path: "/api/analytics/overview",
          method: "GET" as const,
        },
        {
          path: "/api/audit-logs?limit=50",
          method: "GET" as const,
          headers: adminHeader,
        },
        {
          path: "/api/analytics/loans",
          method: "GET" as const,
        },
        {
          path: "/api/health",
          method: "GET" as const,
        },
        {
          path: "/api/analytics/disbursement",
          method: "GET" as const,
        },
        // ── writes (3 slots) ──────────────────────────────────────────────
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
  });
}

main().catch((err) => {
  console.error("mixed-workload scenario failed:", err);
  process.exit(1);
});
