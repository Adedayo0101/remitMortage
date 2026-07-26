import { Request, Response, NextFunction } from "express";
import { logHttpRequest } from "../utils/logger.js";

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
      }
    );
  });

  next();
}
