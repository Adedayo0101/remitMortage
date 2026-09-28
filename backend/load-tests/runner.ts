/**
 * Reusable load-test runner.
 *
 * Wraps autocannon, collects results, enforces acceptance thresholds,
 * and formats a human-readable summary for every scenario.
 */

import autocannon from "autocannon";
import type { LoadTestConfig } from "./config.js";

export interface ScenarioResult {
  name: string;
  /** Requests per second (average over the run) */
  requestsPerSec: number;
  /** Throughput in bytes per second */
  bytesPerSec: number;
  /** Latency percentiles in milliseconds */
  latency: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
    mean: number;
  };
  /** Total requests sent */
  totalRequests: number;
  /** Non-2xx + timeout errors */
  errors: number;
  /** 0–1 fraction */
  errorRate: number;
  /** True when all thresholds are met */
  passed: boolean;
  /** Human-readable reason for failure (empty string when passed) */
  failureReason: string;
  /** Raw DB write latency captured by the scenario (ms), or null when N/A */
  dbWriteLatencyMs: number | null;
}

export interface RunOptions {
  title: string;
  config: LoadTestConfig;
  /** autocannon instance options (url, method, body, headers, etc.) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instanceOptions: autocannon.Options;
  /** Optional: measured DB write latency to include in the report */
  dbWriteLatencyMs?: number | null;
}

/**
 * Runs one autocannon scenario and returns a structured result object.
 */
export async function runScenario(opts: RunOptions): Promise<ScenarioResult> {
  const { title, config, instanceOptions, dbWriteLatencyMs = null } = opts;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`▶  ${title}`);
  console.log(
    `   connections=${config.connections}  duration=${config.duration}s  pipelining=${config.pipelining}`
  );
  console.log(`${"─".repeat(60)}`);

  const result = await autocannon({
    connections: config.connections,
    duration: config.duration,
    pipelining: config.pipelining,
    ...instanceOptions,
  });

  const totalRequests = result.requests.total;
  const errors =
    result.errors +
    result.timeouts +
    (result["non2xx"] ?? 0);
  const errorRate = totalRequests > 0 ? errors / totalRequests : 0;
  const p99 = result.latency.p99;

  const failures: string[] = [];
  if (p99 > config.p99ThresholdMs) {
    failures.push(
      `p99 latency ${p99}ms exceeds threshold ${config.p99ThresholdMs}ms`
    );
  }
  if (errorRate > config.maxErrorRate) {
    failures.push(
      `error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(config.maxErrorRate * 100).toFixed(2)}%`
    );
  }

  const passed = failures.length === 0;

  const scenarioResult: ScenarioResult = {
    name: title,
    requestsPerSec: result.requests.average,
    bytesPerSec: result.throughput.average,
    latency: {
      p50: result.latency.p50,
      p95: result.latency.p97_5,
      p99,
      max: result.latency.max,
      mean: result.latency.mean,
    },
    totalRequests,
    errors,
    errorRate,
    passed,
    failureReason: failures.join("; "),
    dbWriteLatencyMs,
  };

  printScenarioSummary(scenarioResult);
  return scenarioResult;
}

function printScenarioSummary(r: ScenarioResult): void {
  const status = r.passed ? "✅ PASS" : "❌ FAIL";
  console.log(`\nResult: ${status}`);
  console.log(
    `  Throughput : ${r.requestsPerSec.toFixed(1)} req/s  |  ${(r.bytesPerSec / 1024).toFixed(1)} KB/s`
  );
  console.log(
    `  Latency    : p50=${r.latency.p50}ms  p97.5=${r.latency.p95}ms  p99=${r.latency.p99}ms  max=${r.latency.max}ms`
  );
  console.log(
    `  Errors     : ${r.errors} / ${r.totalRequests}  (${(r.errorRate * 100).toFixed(2)}%)`
  );
  if (r.dbWriteLatencyMs !== null) {
    console.log(`  DB write   : ${r.dbWriteLatencyMs.toFixed(1)} ms (sampled)`);
  }
  if (!r.passed) {
    console.log(`  ⚠  ${r.failureReason}`);
  }
}

/**
 * Prints a final summary table across all scenarios and returns an exit code.
 * Exit code 0 = all passed, 1 = one or more failures.
 */
export function printFinalSummary(results: ScenarioResult[]): number {
  const width = 70;
  console.log(`\n${"═".repeat(width)}`);
  console.log("LOAD TEST SUITE — FINAL SUMMARY");
  console.log(`${"═".repeat(width)}`);

  const header = [
    "Scenario".padEnd(32),
    "Req/s".padStart(7),
    "p99(ms)".padStart(8),
    "Err%".padStart(6),
    "Result".padStart(8),
  ].join("  ");
  console.log(header);
  console.log("─".repeat(width));

  let anyFailed = false;
  for (const r of results) {
    const row = [
      r.name.slice(0, 32).padEnd(32),
      r.requestsPerSec.toFixed(1).padStart(7),
      r.latency.p99.toString().padStart(8),
      (r.errorRate * 100).toFixed(2).padStart(6),
      (r.passed ? "PASS ✅" : "FAIL ❌").padStart(8),
    ].join("  ");
    console.log(row);
    if (!r.passed) anyFailed = true;
  }

  console.log("─".repeat(width));
  console.log(
    anyFailed
      ? "\n❌  Some scenarios failed — see details above."
      : "\n✅  All scenarios passed."
  );
  console.log(`${"═".repeat(width)}\n`);

  return anyFailed ? 1 : 0;
}
