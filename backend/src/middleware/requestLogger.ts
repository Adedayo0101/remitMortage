import { Request, Response, NextFunction } from "express";
import { logHttpRequest } from "../utils/logger.js";
import { CORRELATION_ID_HEADER, getCorrelationId } from "./correlationId.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startHrTime = process.hrtime.bigint();

  res.on("finish", () => {
    const endHrTime = process.hrtime.bigint();
    const durationMs = Number(endHrTime - startHrTime) / 1e6;

    logHttpRequest(
      req.method,
      req.originalUrl || req.url,
      res.statusCode,
      durationMs,
      {
        ip: req.ip || req.socket.remoteAddress || "unknown",
        userAgent: req.get("user-agent"),
        // Explicit on the access log line so a request can be looked up by ID
        // even in transports that drop the logger's own `requestId` field.
        correlationId:
          getCorrelationId() ?? res.getHeader(CORRELATION_ID_HEADER) ?? "none",
      }
    );
  });

  next();
}
