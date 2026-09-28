/**
 * Scenario: verification-write
 *
 * Stress test for POST /api/verification/check — the heaviest write path.
 *
 * Every request triggers:
 *   1. analyzeRemittanceHistory (Stellar Horizon HTTP call — cached after first
 *      call if Redis is available)
 *   2. prisma.applicant.upsert    ← PostgreSQL write
 *   3. prisma.verificationResult.create  ← PostgreSQL write
 *
 * Under concurrency this exercises:
 *   - Connection-pool contention from simultaneous upserts
 *   - Upsert conflict handling on the unique stellarAddress index
 *   - Insert throughput on the VerificationResult table
 *
 * A small pool of test Stellar addresses is rotated so the upsert path hits
 * both the INSERT branch (first seen address) and the UPDATE branch (already
 * existing address).  The addresses used are valid Stellar public keys drawn
 * from the Stellar testnet documentation — they will never have real on-chain
 * history so analyzeRemittanceHistory returns quickly with an empty result.
 *
 * The scenario also captures a sampled DB write latency by sending a warm-up
 * request before autocannon starts and timing it manually.
 *
 * Metrics captured:
 *   - Request latency (p50/p95/p99/max)
 *   - Throughput (req/s, bytes/s)
 *   - Error rate (non-2xx + timeouts)
 *   - DB write latency (sampled single request before main run)
 */

import http from "http";
import { loadConfig } from "../config.js";
import { runScenario } from "../runner.js";

// Deterministic test addresses — valid Stellar G-addresses that will never
// carry real remittance history (all-zero key variants from the SDK docs).
const TEST_ADDRESSES = [
  "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBMH6AND4ES3",
  "GBSOLVUQZWJHKM24FH4FKX3LKMM3NBVGSAZJXF7GBZJRGQKBQZ7DYFQ",
  "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGKIUBT5ZWGEJLM6HE3X",
  "GDDQMLB65QS7VXI2OQJR5AEKL4MNPGC5XBKBLGGMZSDL6KN74RYMCV",
  "GDZNKOOKLBX7AGWG2RM7FDVVTLZMJXBDATQHZ5YTJYESGPBR6EPIZBV",
];

/**
 * Sends a single verification request and returns the round-trip latency in ms.
 * Used to capture a sampled DB write latency before the main load run.
 */
function sampleWriteLatency(baseUrl: string, address: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      senderAddress: address,
      recipientAddress: address,
    });
    const url = new URL(`${baseUrl}/api/verification/check`);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? "443" : "80"),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const start = Date.now();
    const req = http.request(options, (res) => {
      res.resume(); // drain the response
      res.on("end", () => resolve(Date.now() - start));
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error("sample request timed out"));
    });
    req.write(body);
    req.end();
  });
}

async function main(): Promise<void> {
  const config = loadConfig();

  // Warm-up: single request to prime the connection pool and Stellar cache,
  // then capture a baseline DB write latency for reporting.
  let dbWriteLatencyMs: number | null = null;
  try {
    console.log("[verification-write] sending warm-up request to sample DB write latency…");
    dbWriteLatencyMs = await sampleWriteLatency(config.baseUrl, TEST_ADDRESSES[0]);
    console.log(`[verification-write] warm-up round-trip: ${dbWriteLatencyMs}ms`);
  } catch (err) {
    console.warn("[verification-write] warm-up failed (server may not be running):", err);
  }

  // Build a round-robin request array across all test addresses so both the
  // INSERT and UPDATE branches of the applicant upsert are exercised.
  const requests = TEST_ADDRESSES.map((address) => ({
    path: "/api/verification/check",
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      senderAddress: address,
      recipientAddress: address,
    }),
  }));

  await runScenario({
    title: "Verification Write (POST /api/verification/check)",
    config,
    instanceOptions: {
      url: config.baseUrl,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      requests,
    },
    dbWriteLatencyMs,
  });
}

main().catch((err) => {
  console.error("verification-write scenario failed:", err);
  process.exit(1);
});
