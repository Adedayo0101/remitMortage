import "dotenv/config";
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import rTracer from "cls-rtracer";
import { swaggerSpec } from "./docs/swagger.js";
import { healthRouter } from "./routes/health.js";
import { verificationRouter } from "./routes/verification.js";
import { borrowerRouter } from "./routes/borrower.js";
import { loanRouter } from "./routes/loan.js";
import { milestoneRouter } from "./routes/milestone.js";
import { analyticsRouter } from "./routes/analytics.js";
import { auditRouter } from "./routes/audit.js";
import { kycRouter } from "./routes/kyc.js";
import { didRouter } from "./routes/did.js";
import { adminRouter } from "./routes/admin.js";
import { workspaceRouter } from "./routes/workspace.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { authMiddleware } from "./middleware/auth.js";
import { startEventListener } from "./services/eventListener.js";
import { startNotificationScheduler } from "./services/notification.js";
import { startScheduler } from "./jobs/scheduler.js";
import { startBackupScheduler } from "./jobs/backupScheduler.js";
import { loadConfig } from "./config.js";
import logger from "./utils/logger.js";
import { initializeRedis } from "./services/redis.js";

const app = express();
const config = loadConfig();
const PORT = config.port;

void initializeRedis();

// ── Middleware ───────────────────────────────────────────────────────────
app.use(requestLogger);
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    if (config.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Basic rate limiter for verification endpoints: 100 requests per minute per IP
const verificationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "Too many requests", statusCode: 429, timestamp: new Date().toISOString() });
  },
});

// ── Routes ──────────────────────────────────────────────────────────────
app.use("/api/health", healthRouter);
app.use("/api/verification", verificationLimiter, verificationRouter);
app.use("/api/borrower", authMiddleware, borrowerRouter);
app.use("/api/loan", authMiddleware, loanRouter);
app.use("/api/milestone", milestoneRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/did", didRouter);
app.use("/api/audit-logs", auditRouter);
app.use("/api/workspaces", workspaceRouter);
// kycRouter applies its own per-route auth (borrower wallet auth on upload,
// operator API key on token issuance/decryption), so it is mounted bare.
app.use("/api/kyc", kycRouter);
app.use("/api/admin", authMiddleware, adminRouter);
// Swagger UI — excluded from rate limits so developers can inspect freely
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Global error handler (must be after routes)
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

// ── Start Server ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info("RemitMortgage API server started", {
    port: PORT,
    environment: process.env.NODE_ENV || "development",
  });

  // Start the Soroban contract event listener alongside the HTTP server. It
  // runs in the background and self-heals via exponential backoff, so a failing
  // RPC node never takes down the API process.
  startEventListener();
  startNotificationScheduler();
  startScheduler();
  startBackupScheduler();
});

export default app;
