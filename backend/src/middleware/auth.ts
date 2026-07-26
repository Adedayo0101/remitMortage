import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: {
    walletAddress: string;
    network: string;
  };
  workspaceAccess?: {
    workspaceId: string;
    role: string;
  };
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token;

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

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token;

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

    const adminWallet = process.env.ADMIN_WALLET_ADDRESS?.toLowerCase();
    const wallet = decoded.walletAddress?.toLowerCase();

    if (!adminWallet || !wallet || wallet !== adminWallet) {
      res.status(403).json({ error: "forbidden", message: "Admin access required" });
      return;
    }

    next();
  } catch (err) {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
    return;
  }
}
