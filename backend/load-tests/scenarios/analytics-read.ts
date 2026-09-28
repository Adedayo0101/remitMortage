/**
 * Scenario: analytics-read
 *
 * Stress test for the analytics aggregate endpoints.
 * These are cached in Redis (60 s TTL) so after the first cold request the
 * responses are served from cache.  This scenario verifies that:
 *   1. The cold-path (cache miss) DB aggregation completes within the p99 budget
 *   2. The warm-path (cache hit) throughput is high — Redis latency is the floor
 *
 * Four endpoints are cycled in round-robin to evenly exercise all analytics paths.
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
    title: "Analytics Read (GET /api/analytics/*)",
    config,
    instanceOptions: {
      url: config.baseUrl,
      method: "GET",
      requests: [
        { path: "/api/analytics/overview", method: "GET" },
        { path: "/api/analytics/loans", method: "GET" },
        { path: "/api/analytics/disbursement", method: "GET" },
        { path: "/api/analytics/volume?months=6", method: "GET" },
        { path: "/api/analytics/volume?months=12", method: "GET" },
      ],
    },
  });
}

main().catch((err) => {
  console.error("analytics-read scenario failed:", err);
  process.exit(1);
});
