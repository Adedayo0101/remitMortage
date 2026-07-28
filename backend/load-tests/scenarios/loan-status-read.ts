/**
 * Scenario: loan-status-read
 *
 * Stress test for GET /api/loan/pending — the most frequently read
 * loan-application query path.
 *
 * Before the schema change this ran a full sequential scan on the
 * LoanApplication table (no index on the `status` column).  After adding
 * @@index([status]) and @@index([applicantId, status]) this query uses an
 * index scan, dramatically reducing I/O under concurrent traffic.
 *
 * A mix of pending-list and individual-by-id lookups is run to exercise both
 * the status-filter index and the primary-key index.
 *
 * Note: the /api/loan/* routes require authMiddleware (JWT bearer).  To avoid
 * needing a live JWT this scenario falls back to requests that don't need auth
 * (health ping) when no AUTH_TOKEN is configured, while still exercising the
 * route infrastructure at the same concurrency level.
 *
 * Set AUTH_TOKEN env var to a valid JWT to hit the real loan routes.
 *
 * Metrics captured:
 *   - Request latency (p50/p95/p99/max)
 *   - Throughput (req/s, bytes/s)
 *   - Error rate (non-2xx + timeouts)
 */

import { loadConfig } from "../config.js";
import { runScenario } from "../runner.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const authToken = process.env.AUTH_TOKEN;

  if (!authToken) {
    console.warn(
      "[loan-status-read] AUTH_TOKEN not set — using unauthenticated fallback (GET /api/health).\n" +
        "  Set AUTH_TOKEN=<jwt> to run real loan-status queries."
    );
  }

  const authHeader = authToken
    ? { Authorization: `Bearer ${authToken}` }
    : {};

  const requests = authToken
    ? [
        {
          path: "/api/loan/pending",
          method: "GET" as const,
          headers: authHeader,
        },
        {
          // borrower address is Stellar test key — will 400 without a real DB row
          // but still exercises the index-scan path up to the Prisma layer
          path: "/api/loan/borrower/GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBMH6AND4ES3",
          method: "GET" as const,
          headers: authHeader,
        },
      ]
    : [{ path: "/api/health", method: "GET" as const }];

  await runScenario({
    title: authToken
      ? "Loan Status Read (GET /api/loan/pending + /borrower/:addr)"
      : "Loan Status Read (fallback: GET /api/health)",
    config,
    instanceOptions: {
      url: config.baseUrl,
      method: "GET",
      headers: authHeader,
      requests,
    },
  });
}

main().catch((err) => {
  console.error("loan-status-read scenario failed:", err);
  process.exit(1);
});
