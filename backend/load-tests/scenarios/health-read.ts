/**
 * Scenario: health-read
 *
 * Baseline load test for GET /api/health.
 * This endpoint executes a raw `SELECT 1` against PostgreSQL on every request,
 * making it the simplest possible measure of connection-pool health under
 * concurrent traffic.  It is used as a reference point — if this scenario
 * degrades, the bottleneck is the connection pool or the database host, not
 * application logic.
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

  await runScenario({
    title: "Health Read (GET /api/health)",
    config,
    instanceOptions: {
      url: `${config.baseUrl}/api/health`,
      method: "GET",
    },
  });
}

main().catch((err) => {
  console.error("health-read scenario failed:", err);
  process.exit(1);
});
