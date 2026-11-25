/**
 * Attaches req.user when a valid access token is present.
 * Does not fail when the token is missing or invalid — routes stay public.
 */
import type { Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import type { AuthRequest } from "./authGuard";

const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME ?? "access_token";

export function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token =
      req.cookies?.[ACCESS_COOKIE_NAME] ||
      req.headers.authorization?.split(" ")[1];

    if (!token) {
      next();
      return;
    }

    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.userId,
      id: payload.userId,
      role: payload.role!,
    };
  } catch {
    // Invalid/expired token on a public route: treat as anonymous.
  }
  next();
}
