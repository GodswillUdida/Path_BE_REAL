import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./auth.schema";
import * as authService from "./auth.service";
import logger from "../../utils/logger";
import { badRequest } from "../../utils/errors";

const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME ?? "refresh_token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const registerController = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = registerSchema.parse(req.body);
    const user = await authService.createUser(
      payload.name,
      payload.email,
      payload.password
    );

    return res.status(201).json({
      success: true,
      message: "Account created. Check your email for a verification link.",
      user,
    });
  }
);

export const loginController = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = loginSchema.parse(req.body);
    const result = await authService.authenticate(
      payload.email,
      payload.password,
      {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        fingerprint: req.headers["x-device-fingerprint"] as string | undefined,
      },
    );

    // set refresh token as httpOnly cookie
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: "Login Successful",
      accessToken: result.tokens.accessToken,
      user: {
        id: result.userId,
        role: result.role,
        name: result.name,
        emailVerified: result.emailVerified,
      },
    });
  }
);

export const verifyEmailController = asyncHandler(
  async (req: Request, res: Response) => {
    const { token } = verifyEmailSchema.parse(req.body);
    await authService.verifyEmail(token);
    return res.status(200).json({ success: true, message: "Email verified" });
  }
);

export const forgotPasswordController = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.requestPasswordReset(email);
    // Always return success to avoid user enumeration
    return res.status(200).json({
      success: true,
      message: "If the email exists we sent reset instructions",
    });
  }
);

export const resetPasswordController = asyncHandler(
  async (req: Request, res: Response) => {
    const data = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(data.token, data.newPassword);
    return res.status(200).json({ success: true, message: "Password updated" });
  }
);

export const refreshTokenController = asyncHandler(
  async (req: Request, res: Response) => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) throw badRequest("No refresh token provided");

    const rotated = await authService.rotateRefreshToken(token);

    res.cookie(REFRESH_COOKIE_NAME, rotated.refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      accessToken: rotated.accessToken,
    });
  }
);

export const logoutController = asyncHandler(
  async (req: Request, res: Response) => {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];

    if (token) {
      try {
        const { verifyRefreshToken } = await import("../../lib/jwt");
        const payload = verifyRefreshToken(token) as { tokenId?: string };

        if (payload?.tokenId) {
          await authService.logout(payload.tokenId);
        }
      } catch (err) {
        logger.warn("Logout: invalid refresh token", {
          error: (err as Error).message,
        });
      }
    }

    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out",
    });
  },
);

export const logoutAllController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id; // from auth middleware
    if (!userId) throw badRequest("Unauthorized");

    await authService.logoutAll(userId);

    res.clearCookie(REFRESH_COOKIE_NAME, {
      path: "/api/auth",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out from all devices",
    });
  },
);

export const getSessionsController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw badRequest("Unauthorized");

    const sessions = await authService.getUserSessions(userId);

    return res.status(200).json({
      success: true,
      sessions,
    });
  },
);

export const revokeSessionController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) throw badRequest("Unauthorized");

    await authService.revokeSession(userId, id);

    return res.status(200).json({
      success: true,
      message: "Session revoked",
    });
  },
);
