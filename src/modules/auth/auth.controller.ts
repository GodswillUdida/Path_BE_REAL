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
  resetPasswordVerifySchema,
} from "./auth.schema";
import { RefreshTokenPayload, verifyRefreshToken } from "../../lib/jwt";
import { completeGuestProfileSchema, sendCheckoutOtpSchema, verifyCheckoutOtpSchema, verifyMagicLoginSchema } from "./checkout.schema";

// ─── Cookie Config ────────────────────────────────────────────────────────────
const ACCESS_COOKIE_NAME = process.env.ACCESS_COOKIE_NAME ?? "access_token";
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME ?? "refresh_token";
const isProd = process.env.NODE_ENV === "production";

const BASE_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,                   
  sameSite: "none",
  path: "/",
  ...(isProd && { domain: process.env.COOKIE_DOMAIN }),
};

const ACCESS_COOKIE_OPTIONS: CookieOptions = {
  ...BASE_COOKIE_OPTIONS,
  maxAge: 15 * 60 * 1000,            // 15 minutes (as requested)
};

const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  ...BASE_COOKIE_OPTIONS,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Clearing cookie
const CLEAR_COOKIE_OPTIONS: CookieOptions = {
  ...BASE_COOKIE_OPTIONS,
  maxAge: 0,
};

const sendAuthResponse = (
  res: Response,
  result: authService.AuthResult,
  statusCode = 200
) => {
  res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Days
  });

  return res.status(statusCode).json({
    success: true,
    accessToken: result.tokens.accessToken, // Access token stays in body
    user: result.user,
  });
};

function extractMeta(req: Request): authService.RequestMeta {
  return {
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip,
    fingerprint: req.headers["x-device-fingerprint"] as string | undefined,
  };
}

export function issueTokenResponse(
  res: Response,
  result: authService.AuthResult,
  statusCode = 200,
): Response {

  // REFRESH_COOKIE_NAME

  res.cookie(
    "access_token",
    result.tokens.accessToken,
    ACCESS_COOKIE_OPTIONS,
  );


  res.cookie(
    "refresh_token",
    result.tokens.refreshToken,
    REFRESH_COOKIE_OPTIONS,
  );


  return res.status(statusCode).json({
    success: true,
    accessToken: result.tokens.accessToken,
    user: result.user,
  });
}

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

export const googleCallbackController = asyncHandler(async (req, res) => {
  // 1. Check if passport already populated req.user
  const user = req.user as unknown as authService.SessionUser | undefined;

  // 2. Fallback: If no passport, handle via authorization code from query
  if (!user && req.query.code) {
    const result = await authService.handleGoogleCallback(
      req.query.code as string,
      extractMeta(req)
    );
    return sendAuthResponse(res, result);
  }

  if (!user) {
    return res.redirect(`${process.env.FRONTEND_URL}/auth/login?error=unauthorized`);
  }

  const result = await authService.createSessionAndTokens(user, extractMeta(req));
  
  // For OAuth redirects, we MUST set the cookie and redirect
  res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
  
  // We append the access token as a short-lived query param or hash 
  // so the frontend can grab it and clear the URL.
  return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${result.tokens.accessToken}`);
});
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

// export const verifyMagicLoginController = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { email, token } = req.body as { email?: string; token?: string };

//     // Manual guard: these two fields don't have a dedicated schema yet.
//     if (!email || !token) {
//       throw unauthorized("email and token are required");
//     }

//     const result = await authService.verifyMagicLogin(email, token);

//     issueTokenResponse(res, result);
//   },
// );

// ─── Guest OTP ────────────────────────────────────────────────────────────────

export const sendCheckoutOtpController = asyncHandler(async (req: Request, res: Response) => {
  const { email } = sendCheckoutOtpSchema.parse(req.body);
  const result = await authService.sendCheckoutOtp(email);
  res.status(200).json({ success: true, ...result });
});

export const verifyCheckoutOtpController = asyncHandler(async (req: Request, res: Response) => {
  const { email, code } = verifyCheckoutOtpSchema.parse(req.body);
  await authService.verifyCheckoutOtp(email, code);
  // After OTP we just confirm — profile step comes next
  res.status(200).json({ success: true, message: "OTP verified. Please complete your profile." });
});

export const completeGuestProfileController = asyncHandler(async (req: Request, res: Response) => {
  const dto = completeGuestProfileSchema.parse(req.body);
  const user = await authService.completeGuestProfile(dto);
  res.status(200).json({ success: true, user });
});

export const verifyMagicLoginController = asyncHandler(async (req: Request, res: Response) => {
  const { email, token } = verifyMagicLoginSchema.parse(req.body);
  const result = await authService.verifyMagicLogin(email, token);
  return issueTokenResponse(res, result, 200); // sets cookies + returns accessToken
});

// export const verifyMagicLoginController = asyncHandler(async (req: Request, res: Response) => {
//   const { email, token } = verifyMagicLoginSchema.parse(req.body);
//   const result = await authService.verifyMagicLogin(email, token);
//   issueTokenResponse(res, result); // sets cookies + returns accessToken
// });

// ─── Guest Login ──────────────────────────────────────────────────────────────

// export const guestLoginController = asyncHandler(
//   async (req: Request, res: Response) => {
//     const { email } = guestLoginSchema.parse(req.body);
//     const result = await authService.guestLogin(email, extractMeta(req));

//     issueTokenResponse(res, result);
//   },
// );

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
      valid: isValid,
      message: isValid ? "Token is valid" : "Token is invalid or expired" 
    });
  }
);

export const resetPasswordController = asyncHandler(
  async (req: Request, res: Response) => {
    const dto = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(dto);

    res.status(200).json({ 
      success: true, 
      message: "Password updated successfully. Please log in with your new password." 
    });
  }
);
