/**
 * Scenario: audit-log-read
 *
 * Stress test for GET /api/audit-logs — the heaviest paginated read endpoint.
 *
 * This endpoint runs a keyset-paginated AuditLog.findMany query against the
 * composite (action, createdAt) index.  Under high concurrency it exercises:
 *   1. Index-range scans on a high-write-throughput table
 *   2. Connection-pool contention when many parallel reads compete for slots
 *   3. The 50 ms slow-query budget logged by the route
 *
 * Both a plain list query and a filtered-by-action query are interleaved via
 * autocannon's `requests` array to surface any difference in selectivity.
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

  const authHeader = { Authorization: `Bearer ${config.adminApiKey}` };

  // Interleave unfiltered and filtered queries so both index paths are hit.
  await runScenario({
    title: "Audit Log Read (GET /api/audit-logs)",
    config,
    instanceOptions: {
      url: config.baseUrl,
      method: "GET",
      headers: authHeader,
      // autocannon cycles through this array in round-robin order
      requests: [
        {
          path: "/api/audit-logs?limit=20",
          method: "GET",
          headers: authHeader,
        },
        {
          path: "/api/audit-logs?limit=20&action=verification.check",
          method: "GET",
          headers: authHeader,
        },
        {
          path: "/api/audit-logs?limit=50",
          method: "GET",
          headers: authHeader,
        },
        {
          path: "/api/audit-logs?limit=20&action=milestone.proposal_created",
          method: "GET",
          headers: authHeader,
        },
      ],
    },
  });
}

main().catch((err) => {
  console.error("audit-log-read scenario failed:", err);
  process.exit(1);
});
