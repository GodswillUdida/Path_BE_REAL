import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import * as authService from "./auth.service";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  paginationSchema,
  resendVerificationEmailSchema,
  resetPasswordVerifySchema,
} from "./auth.schema";
import { RefreshTokenPayload, verifyRefreshToken } from "../../lib/jwt";
import {
  ACCESS_COOKIE_NAME,
  CLEAR_COOKIE_OPTIONS,
  extractMeta,
  issueTokens,
  REFRESH_COOKIE_NAME,
} from "./config";
import { GoogleProfile } from "./types";

export const googleCallbackController = asyncHandler(async (req, res) => {
  const cookieState = req.cookies.oauth_state;
  const queryState = req.query.state as string | undefined;
  const isProd = process.env.NODE_ENV === "production";

  res.clearCookie("oauth_state", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  });

  if (!cookieState || !queryState || cookieState !== queryState) {
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/login?error=invalid_state`,
    );
  }

  // 1. Check if passport already populated req.user
  const passportUser = req.user as GoogleProfile | undefined;

  if (!passportUser) {
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/login?error=google_failed`,
    );
  }

  const result = await authService.processGoogleOAuth(
    passportUser,
    extractMeta(req),
  );

  issueTokens(res, result);

  return res.redirect(
    `${process.env.FRONTEND_URL}/auth/callback?status=success`,
  );
});

export const registerController = asyncHandler(
  async (req: Request, res: Response) => {
    const dto = registerSchema.parse(req.body);
    const user = await authService.createUser(dto);

    res.status(201).json({
      success: true,
      message: "Account created. Please check your email to verify.",
      user,
    });
  },
);

export const verifyEmailController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, code } = verifyEmailSchema.parse(req.body);
    const verifiedUser = await authService.verifyEmail(
      email,
      code,
      extractMeta(req),
    );
    issueTokens(res, verifiedUser, 200);
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

export const loginController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);

    const result = await authService.authenticate(
      email,
      password,
      extractMeta(req),
    );

    return issueTokens(res, result, 200);
  },
);

// ────── REFRESH TOKEN ───────────────────────────────────────────────────

export const refreshTokenController = asyncHandler(
  async (req: Request, res: Response) => {
    const oldRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!oldRefreshToken) throw unauthorized("No refresh token");

    const meta = extractMeta(req);

    const result = await authService.rotateRefreshToken(oldRefreshToken, meta);

    return issueTokens(res, result, 200);
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
      message: "Logged out from all devices successfully",
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
    if (!userId) return res.status(200).json({ success: true, user: null }); // Not throwing unauthorized here since this endpoint is often used to check auth status.

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

export const verifyPasswordResetTokenController = asyncHandler(
  async (req: Request, res: Response) => {
    const { token } = resetPasswordVerifySchema.parse(req.params); // or use req.params directly with validation
    const isValid = await authService.verifyPasswordResetToken(token);

    res.status(200).json({
      success: true,
      message: isValid ? "Token is valid" : "Token is invalid or expired",
    });
  },
);

export const resetPasswordController = asyncHandler(
  async (req: Request, res: Response) => {
    const dto = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(dto);

    res.status(200).json({
      success: true,
      message:
        "Password updated successfully. Please log in with your new password.",
    });
  },
);
