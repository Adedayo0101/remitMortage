import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { loadConfig } from "../config.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    walletAddress: string;
    network: string;
  };
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Accept token from HTTP-only cookie or Authorization: Bearer <token> header
  const authHeader = req.headers.authorization;
  const token =
    req.cookies?.token ||
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined);

  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Authentication token missing" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_jwt_secret") as {
      walletAddress: string;
      network: string;
    };
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
    return;
  }
}

/**
 * Gates admin-only routes (e.g. the audit log query endpoint) behind a static
 * API key, kept separate from the wallet-based JWT flow in {@link authMiddleware}.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ error: "missing_authorization", message: "Authorization header is required" });
    return;
  }

  const token = authHeader.slice(7);
  const { adminApiKey } = loadConfig();

  if (token !== adminApiKey) {
    res.status(403).json({ error: "forbidden", message: "Invalid admin credentials" });
    return;
  }

  next();
}
