import type { Response, NextFunction } from "express";
import prisma from "../config/db";
import { verifyRefreshToken } from "../lib/jwt";
import { compareTokenHash } from "../utils/hash";
import { unauthorized } from "../utils/errors";
import logger from "../utils/logger";
import type { AuthRequest } from "./authGuard";

// ─── Constants ────────────────────────────────────────────────────────────────

const REFRESH_COOKIE_NAME =
  process.env.REFRESH_COOKIE_NAME ?? "refresh_token";

// ─── Guard ────────────────────────────────────────────────────────────────────

/**
 * Stateful session guard — for routes that need proof the session is still
 * alive in the database (e.g. /me, /logout, /sessions).
 *
 * Validation chain:
 *   1. Extract refresh token from httpOnly cookie
 *   2. Verify JWT signature + expiry
 *   3. Load session record by tokenId (indexed lookup)
 *   4. Check session.expiresAt has not passed
 *   5. Compare token hash against stored digest (detects theft / rotation)
 *   6. On hash mismatch → nuke all sessions for that user (session-fixation response)
 *
 * On success: attaches `req.user` with id + role sourced from the session's
 * joined User row — not from the JWT payload alone.
 */

export async function sessionGuard(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const refreshToken: string | undefined = await req.cookies?.[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      // ── Anticipated unauthenticated check for /auth/me only ─────────────────
      // This is the exact case that was spamming "warn: ApiError: No active session".
      // We silently attach null user and continue (no error, no warn log).
      // All other routes using sessionGuard remain completely unchanged.
      if (req.originalUrl?.includes("/auth/me") || req.path?.includes("/me")) {
        req.user = undefined;
        return next();
      }
      throw unauthorized("No active session");
    }

    let payload: ReturnType<typeof verifyRefreshToken>;

    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      logger.warn("sessionGuard: refresh token signature invalid");
      throw unauthorized("Invalid or expired session");
    }

    const session = await prisma.session.findUnique({
      where: { tokenId: payload.tokenId },
      select: {
        tokenHash: true,
        expiresAt: true,
        userId: true,
        user: {
          select: { id: true, role: true },
        },
      },
    });

    if (!session) {
      throw unauthorized("Session not found");
    }

    if (session.expiresAt < new Date()) {
      throw unauthorized("Session expired");
    }

    if (!compareTokenHash(refreshToken, session.tokenHash)) {
      await prisma.session.deleteMany({ where: { userId: session.userId } });
      logger.warn("sessionGuard: token hash mismatch — revoked all sessions");
      throw unauthorized("Session compromised. Please log in again.");
    }

    req.user = {
      userId: session.userId,
      id: session.user.id,
      role: session.user.role,
    };

    next();
  } catch (err) {
    // ← This is the critical line
    next(err); // forwards ApiError (or any error) to your errorHandler
  }
}