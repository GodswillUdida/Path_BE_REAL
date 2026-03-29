import type { Request, Response, NextFunction } from "express";
import { unauthorized } from "../utils/errors";
import { verifyAccessToken } from "../lib/jwt";
import logger from "../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

// ─── Guard ────────────────────────────────────────────────────────────────────

/**
 * Stateless access-token guard.
 *
 * Verifies a signed Bearer JWT in the Authorization header and attaches the
 * decoded payload to `req.user`. No database round-trip — use `sessionGuard`
 * when you need DB-backed session validation.
 *
 * Rejects:
 *   - Missing or malformed Authorization header
 *   - Expired or tampered access tokens
 */
export function authGuard(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw unauthorized("Missing or invalid Authorization header");
  }

  const token = header.slice(7); // "Bearer ".length === 7

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.userId, role: payload.role! };
    next();
  } catch (err) {
    logger.warn("authGuard: invalid or expired access token");
    throw unauthorized("Invalid or expired token");
  }
}