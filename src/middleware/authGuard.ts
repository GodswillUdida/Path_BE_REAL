import type { Request, Response, NextFunction } from "express";
import { unauthorized } from "../utils/errors";
import { verifyAccessToken } from "../lib/jwt";
import logger from "../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    id: string;
    role: string;
    tokenId?: string;
  };
}


const ACCESS_COOKIE_NAME =
  process.env.ACCESS_COOKIE_NAME ?? "access_token";

export function authGuard(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  try {
    let token: string | undefined;

    // ✅ PRIMARY: cookie (your architecture)
    if (req.cookies?.[ACCESS_COOKIE_NAME]) {
      token = req.cookies[ACCESS_COOKIE_NAME];
    }

    // ✅ FALLBACK: Authorization header (optional)
    else if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.slice(7);
    }

    if (!token) {
      throw unauthorized("No token provided");
    }

    const payload = verifyAccessToken(token);

    req.user = {
      userId: payload.userId,
      id: payload.userId,
      role: payload.role!,
    };

    next();
  } catch (err) {
    logger.warn("authGuard: invalid/expired token");
    next(unauthorized("Invalid or expired access token"));
  }
}