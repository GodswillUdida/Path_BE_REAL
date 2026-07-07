import { CookieOptions, Request, Response } from "express";
import crypto from "crypto"
import { AuthResult, RequestMeta, SessionUser } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

export const TTL = {
  VERIFICATION_TOKEN: 24 * 60 * 60 * 1000, //  24 h
  RESET_TOKEN: 1 * 60 * 60 * 1000, //   1 h
  REFRESH_SESSION: 7 * 24 * 60 * 60 * 1000, // 7 d
  OTP: 15 * 60 * 1000, //  15 min,
  MAGIC_LINK: 15 * 60 * 1000, // 15 min
} as const;

/** Dummy bcrypt hash used for constant-time login path when user is not found. */
export const DUMMY_HASH =
  "$2b$12$invalidsaltthatisexactly22chars.invalidhashpadding123456";

// Helper to generate 6-digit code
export const generateOTP = (): string => {
  return crypto.randomInt(100000, 1000000).toString();
};


export const generateMagicToken = (): string => crypto.randomBytes(32).toString("hex");

export const hashOTP = (code: string): string =>
  crypto.createHash("sha256").update(code).digest("hex");

export const generateToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString("hex");

export const toPublicUser = (user: SessionUser): Required<SessionUser> => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  emailVerified: user.emailVerified,
});


// ─── Cookie Config ────────────────────────────────────────────────────────────
export const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME!;
export const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME!;
const isProd = process.env.NODE_ENV === "production";

const BASE_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax",
  path: "/",
  // ...(isProd && { domain: process.env.COOKIE_DOMAIN }), // only set domain in production
};

const ACCESS_COOKIE_OPTIONS: CookieOptions = {
  ...BASE_COOKIE_OPTIONS,
  maxAge: 15 * 60 * 1000,
};

export const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  ...BASE_COOKIE_OPTIONS,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Clearing cookie
export const CLEAR_COOKIE_OPTIONS: CookieOptions = {
  ...BASE_COOKIE_OPTIONS,
  maxAge: 0,
};

export function clearAuthCookies(res: Response): void {
  const clear: CookieOptions = { ...BASE_COOKIE_OPTIONS, maxAge: 0 };
  res.clearCookie(ACCESS_COOKIE_NAME, clear);
  res.clearCookie(REFRESH_COOKIE_NAME, clear);
}

export function extractMeta(req: Request): RequestMeta {
  return {
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip,
    fingerprint: req.headers["x-device-fingerprint"] as string | undefined,
  };
}

export function issueTokens(
  res: Response,
  result: AuthResult,
  statusCode = 200,
): Response {
  res.cookie(ACCESS_COOKIE_NAME, result.tokens.accessToken, ACCESS_COOKIE_OPTIONS);
  res.cookie(
    REFRESH_COOKIE_NAME,
    result.tokens.refreshToken,
    REFRESH_COOKIE_OPTIONS,
  );

  return res.status(statusCode).json({
    success: true,
    // accessToken: result.tokens.accessToken,
    user: result.user,
  });
}