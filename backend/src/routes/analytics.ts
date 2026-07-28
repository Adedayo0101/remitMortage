import { Router } from "express";
import {
  getProtocolOverview,
  getLoanPerformance,
  getDisbursementProgress,
  getMonthlyVolume,
} from "../services/analytics.js";
import { getLendingPoolRates } from "../services/soroban.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { loadConfig } from "../config.js";

export const analyticsRouter = Router();

const DEFAULT_VOLUME_MONTHS = 6;
const MAX_VOLUME_MONTHS = 24;

/**
 * @openapi
 * /api/analytics/overview:
 *   get:
 *     summary: Protocol overview metrics
 *     description: >-
 *       Returns aggregate protocol metrics — total value locked (escrow +
 *       lending pool), and counts of borrowers, investors, and loans. Cached
 *       for 60 seconds.
 *     tags:
 *       - Analytics
 *     responses:
 *       200:
 *         description: Protocol summary.
 */
analyticsRouter.get("/overview", cacheMiddleware(60), (_req, res) => {
  try {
    res.json(getProtocolOverview());
  } catch (error) {
    console.error("Analytics overview error:", error);
    res.status(500).json({ error: "Failed to compute protocol overview" });
  }
});

/**
 * @openapi
 * /api/analytics/loans:
 *   get:
 *     summary: Loan performance breakdown
 *     description: >-
 *       Returns active/repaid/defaulted loan counts along with repayment rate,
 *       default rate, and on-time payment percentage. Cached for 60 seconds.
 *     tags:
 *       - Analytics
 *     responses:
 *       200:
 *         description: Loan performance metrics.
 */
analyticsRouter.get("/loans", cacheMiddleware(60), (_req, res) => {
  try {
    res.json(getLoanPerformance());
  } catch (error) {
    console.error("Analytics loans error:", error);
    res.status(500).json({ error: "Failed to compute loan performance" });
  }
});

/**
 * @openapi
 * /api/analytics/disbursement:
 *   get:
 *     summary: Disbursement and milestone progress
 *     description: >-
 *       Returns total disbursed, milestones completed vs. pending, and the
 *       average time to complete a milestone. Cached for 60 seconds.
 *     tags:
 *       - Analytics
 *     responses:
 *       200:
 *         description: Disbursement progress metrics.
 */
analyticsRouter.get("/disbursement", cacheMiddleware(60), (_req, res) => {
  try {
    res.json(getDisbursementProgress());
  } catch (error) {
    console.error("Analytics disbursement error:", error);
    res.status(500).json({ error: "Failed to compute disbursement progress" });
  }
});

/**
 * @openapi
 * /api/analytics/volume:
 *   get:
 *     summary: Monthly volume time-series
 *     description: >-
 *       Returns monthly deposit, repayment, and disbursement volume for the
 *       requested number of months (default 6, max 24). Cached for 60 seconds.
 *     tags:
 *       - Analytics
 *     parameters:
 *       - in: query
 *         name: months
 *         required: false
 *         description: Number of trailing months to return (1-24).
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 24
 *           default: 6
 *     responses:
 *       200:
 *         description: Monthly volume series, oldest first.
 */
analyticsRouter.get("/volume", cacheMiddleware(60), (req, res) => {
  try {
    const parsed = parseInt(String(req.query.months ?? ""), 10);
    const months = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), MAX_VOLUME_MONTHS)
      : DEFAULT_VOLUME_MONTHS;
    res.json(getMonthlyVolume(months));
  } catch (error) {
    console.error("Analytics volume error:", error);
    res.status(500).json({ error: "Failed to compute monthly volume" });
  }
});

/**
 * @openapi
 * /api/analytics/pool-rates:
 *   get:
 *     summary: Live lending-pool interest rates
 *     description: >-
 *       Reads the deployed lending-pool contract's on-chain configuration
 *       (the protocol's rate registry) and derives the current senior and
 *       junior tranche APYs from it, rather than a static estimate. Cached
 *       for 60 seconds to limit RPC traffic.
 *     tags:
 *       - Analytics
 *     responses:
 *       200:
 *         description: Live pool/senior/junior APY figures (basis points) and tranche liquidity.
 *       502:
 *         description: Unable to query the lending-pool contract.
 *       503:
 *         description: Lending pool contract is not configured.
 */
analyticsRouter.get("/pool-rates", cacheMiddleware(60), async (_req, res) => {
  const { lendingPoolContractId } = loadConfig();

  if (!lendingPoolContractId) {
    res.status(503).json({
      error: "not_configured",
      message: "LENDING_POOL_CONTRACT_ID is not configured",
    });
    return;
  }

  try {
    const rates = await getLendingPoolRates(lendingPoolContractId);
    res.json(rates);
  } catch (error) {
    console.error("Analytics pool-rates error:", error);
    res.status(502).json({
      error: "on_chain_unavailable",
      message: "Unable to query the lending pool contract. Please retry shortly.",
    });
  }
});
