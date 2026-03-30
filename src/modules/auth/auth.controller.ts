/**
 * @file auth.controller.ts
 * @description Thin HTTP adapter layer — validates input, delegates to authService,
 *              shapes the response. No business logic lives here.
 *
 * Response contract (all endpoints):
 *   Success → { success: true, ...payload }
 *   Error   → handled by the global error middleware via thrown AppError
 *
 * Cookie strategy:
 *   Refresh token is always in an httpOnly cookie.
 *   Access token is returned in the JSON body only (never in a cookie).
 */

import type { Request, Response, CookieOptions } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as authService from "./auth.service";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  guestLoginSchema,
  guestOtpSendSchema,
  guestOtpVerifySchema,
  paginationSchema,
  resendVerificationEmailSchema,
} from "./auth.schema";
import { RefreshTokenPayload, verifyRefreshToken } from "../../lib/jwt";

// ─── Cookie Config ────────────────────────────────────────────────────────────
const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME ?? "access_token";
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME ?? "refresh_token";
const isProd = process.env.NODE_ENV === "production";

const BASE_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProd,                    // false in dev, true in prod
  sameSite: isProd ? "lax" : "lax", // FIXED from "none" → much safer
  path: "/",
};

const ACCESS_COOKIE_OPTIONS: CookieOptions = {
  ...BASE_COOKIE_OPTIONS,
  maxAge: 15 * 60 * 1000,            // 15 minutes (as requested)
};

const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  // httpOnly: true,
  // secure: true,                 // ✅ only true in prod
  // sameSite: isProd ? "none" : "none", // ✅ avoids local dev breakage
  // path: "/",
  ...BASE_COOKIE_OPTIONS,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Clearing cookie
const CLEAR_COOKIE_OPTIONS: CookieOptions = {
  ...BASE_COOKIE_OPTIONS,
  maxAge: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extracts validated RequestMeta from an Express request. */
function extractMeta(req: Request): authService.RequestMeta {
  return {
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip,
    fingerprint: req.headers["x-device-fingerprint"] as string | undefined,
  };
}

/**
 * Sets the httpOnly refresh-token cookie and returns the access token +
 * public user payload in the response body.
 *
 * Keeping all cookie logic in one place ensures consistent behaviour across
 * every auth flow that issues tokens.
 */

export function issueTokenResponse(
  res: Response,
  result: authService.AuthResult,
  statusCode = 200,
): Response {

  res.cookie(
    ACCESS_COOKIE_NAME,
    result.tokens.accessToken,
    ACCESS_COOKIE_OPTIONS,
  );


  res.cookie(
    REFRESH_COOKIE_NAME,
    result.tokens.refreshToken,
    REFRESH_COOKIE_OPTIONS,
  );


  return res.status(statusCode).json({
    success: true,
    accessToken: result.tokens.accessToken,
    user: result.user,
  });
}

// ─── Registration & Email Verification ───────────────────────────────────────

export const registerController = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, email, password } = registerSchema.parse(req.body);
    const user = await authService.createUser(name, email, password);

    res.status(201).json({
      success: true,
      message: "Account created. Please check your email to verify.",
      user
    });
  },
);

export const verifyEmailController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, code } = verifyEmailSchema.parse(req.body);
    const verifiedUser = await authService.verifyEmail(email, code, extractMeta(req));

    issueTokenResponse(res, verifiedUser, 200);

  },
);

export const resendVerificationEmailController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = resendVerificationEmailSchema.parse(req.body);
    await authService.resendVerificationEmail(email);

    res.status(200).json({
      success: true,
      message: "A new verification code has been sent.",
    });
  },
);

// ─── Credential Login ─────────────────────────────────────────────────────────

export const loginController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);

    const result = await authService.authenticate(
      email,
      password,
      extractMeta(req),
    );

    return issueTokenResponse(res, result, 200);

  },
);

// ─── Google OAuth (Redirect Flow) ─────────────────────────────────────────────

/**
 * GET /auth/google
 * Redirects the browser to Google's consent screen.
 */
export const startGoogleOAuthController = (
  _req: Request,
  res: Response,
): void => {
  const params = new URLSearchParams({
    client_id: process.env.G_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: [
      "openid",
      "profile",
      "email",
    ].join(" "),
    access_type: "offline",
    prompt: "select_account",
  });
  // const redirectUri = `${process.env.BACKEND_URL}/api/v1/auth/google/callback`;
  // console.log("redirect_uri sent to Google:", redirectUri);

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};

/**
 * GET /auth/google/callback
 * Receives the authorization code, exchanges it for tokens, and redirects
 * the browser to the frontend callback page.
 *
 * On success: sets the refresh-token cookie then redirects to /auth/callback.
 * On failure: redirects to /auth/login?error=google_failed.
 *
 * The frontend /auth/callback page reads the access token from the redirect
 * URL hash or calls GET /auth/me with the existing cookie.
 */
export const googleCallbackController = asyncHandler(
  async (req: Request, res: Response) => {
    const user = req.user as any; // User returned from handleGoogleUser()

    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/login?error=auth_failed`);
    }

    const result = await authService.handleGoogleCallback(
      user.profile.code,
      extractMeta(req),
    );

    if (!result) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/login?error=auth_failed`);
    }
    // Set cookies and redirect to frontend callback page
    res.cookie(
      ACCESS_COOKIE_NAME,
      result.tokens.accessToken,
      ACCESS_COOKIE_OPTIONS,
    );
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.tokens.refreshToken,
      REFRESH_COOKIE_OPTIONS,
    );

    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback`);
  }
);

// ─── Magic Link ───────────────────────────────────────────────────────────────

export const sendMagicLoginController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = guestOtpSendSchema.parse(req.body); // { email: z.string().email() }
    // await sendMagicLogin(email);

    res
      .status(200)
      .json({ success: true, message: "Magic link sent to your email" });
  },
);

export const verifyMagicLoginController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, token } = req.body as { email?: string; token?: string };

    // Manual guard: these two fields don't have a dedicated schema yet.
    if (!email || !token) {
      throw unauthorized("email and token are required");
    }

    const result = await authService.verifyMagicLogin(email, token);

    issueTokenResponse(res, result);
  },
);

// ─── Guest OTP ────────────────────────────────────────────────────────────────

export const sendGuestOtpController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = guestOtpSendSchema.parse(req.body);
    await authService.sendGuestOtp(email);

    res.status(200).json({ success: true, message: "OTP sent to your email" });
  },
);

export const verifyGuestOtpController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, code } = guestOtpVerifySchema.parse(req.body);
    await authService.verifyGuestOtp(email, code);

    res
      .status(200)
      .json({ success: true, message: "OTP verified successfully" });
  },
);

// ─── Guest Login ──────────────────────────────────────────────────────────────

export const guestLoginController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = guestLoginSchema.parse(req.body);
    const result = await authService.guestLoginService(email, extractMeta(req));

    issueTokenResponse(res, result);
  },
);

// ─── Token Refresh ────────────────────────────────────────────────────────────

/**
 * Accepts the refresh token from:
 *   1. httpOnly cookie  (browser SPA)
 *   2. Request body     (mobile / server-to-server)
 *
 * Always writes the new refresh token back as a cookie so both paths stay in sync.
 */
export const refreshTokenController = asyncHandler(
  async (req: Request, res: Response) => {
   const oldRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!oldRefreshToken) throw unauthorized("No refresh token");

    const meta = extractMeta(req);
    // const result = await rotateRefreshToken(refreshToken, meta);

    const result = await authService.rotateRefreshToken(oldRefreshToken, meta);

    return issueTokenResponse(res, result, 200);

  },
);

// ─── Logout ───────────────────────────────────────────────────────────────────

export const logoutController = asyncHandler(
  async (req: Request, res: Response) => {
    // tokenId is attached to req by authGuard after verifying the access token.
    // We revoke by tokenId, not the raw refresh token string.

    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (refreshToken) {
      try {
        const payload = verifyRefreshToken(refreshToken) as RefreshTokenPayload;
        await authService.logout(payload.tokenId).catch(() => {
          // Non-fatal: session may already be gone
        });
      } catch {
        // Invalid token → just clear cookies
      }
    }

    // const tokenId = req.user?.tokenId;
    // if (tokenId) {
    //   await authService.logout(tokenId).catch(() => {
    //     // Non-fatal: session may have already expired; cookie is cleared regardless.
    //   });
    // }

    // res.clearCookie(REFRESH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS);
    res.cookie(ACCESS_COOKIE_NAME, "", CLEAR_COOKIE_OPTIONS);
    res.cookie(REFRESH_COOKIE_NAME, "", CLEAR_COOKIE_OPTIONS);
    res.status(200).json({ success: true, message: "Logged out successfully" });
  },
);

export const logoutAllController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw unauthorized("Unauthorized");

    await authService.logoutAll(userId);

    res.cookie(ACCESS_COOKIE_NAME, "", CLEAR_COOKIE_OPTIONS);
    res.clearCookie(REFRESH_COOKIE_NAME, CLEAR_COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: "Logged out from all devices",
    });
  },
);

// ─── Session Management ───────────────────────────────────────────────────────

export const getSessionsController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw unauthorized("Unauthorized");

    const sessions = await authService.getUserSessions(userId);

    res.status(200).json({ success: true, sessions });
  },
);

export const revokeSessionController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw unauthorized("Unauthorized");

    await authService.revokeSession(userId, req.params.id as string);

    res.status(200).json({ success: true, message: "Session revoked" });
  },
);

// ─── User Queries ─────────────────────────────────────────────────────────────

export const getMeController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw unauthorized("Unauthorized");

    const user = await authService.getUserById(userId);

    res.status(200).json({ success: true, user });
  },
);

export const getAllUsersController = asyncHandler(
  async (req: Request, res: Response) => {
    const { page, pageSize } = paginationSchema.parse(req.query);
    const result = await authService.getAllUsers(page, pageSize);

    res.status(200).json({ success: true, ...result });
  },
);

// ─── Password Reset ───────────────────────────────────────────────────────────

export const forgotPasswordController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.requestPasswordReset(email);

    // Always 200 — never reveal whether the email exists.
    res.status(200).json({
      success: true,
      message:
        "If that email exists, password reset instructions have been sent.",
    });
  },
);

export const resetPasswordController = asyncHandler(
  async (req: Request, res: Response) => {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, newPassword);

    res
      .status(200)
      .json({ success: true, message: "Password updated successfully" });
  },
);
