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
      payload.password
    );

    // set refresh token as httpOnly cookie
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, COOKIE_OPTIONS);

    return res.status(200).json({
      success: true,
      message: "Login Successful",
      ...result,
      // accessToken: result.tokens.accessToken,
      // user: {
      //   id: result.userId,
      //   role: result.role,
      //   name: result.name,
      //   emailVerified: result.emailVerified,
      // },
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
    const cookie =
      req.cookies?.[process.env.REFRESH_COOKIE_NAME ?? "refresh_token"];
    if (!cookie) throw badRequest("No refresh token provided");

    const rotated = await authService.rotateRefreshToken(cookie);

    // set new refresh cookie
    res.cookie(REFRESH_COOKIE_NAME, rotated.refreshToken, COOKIE_OPTIONS);

    res.status(200).json({ success: true, accessToken: rotated.accessToken });
  }
);

export const logoutController = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      const cookie =
        req.cookies?.[process.env.REFRESH_COOKIE_NAME ?? "refresh_token"];
      if (cookie) {
        const { verifyRefreshToken } = await import("../../lib/jwt");
        const payload = verifyRefreshToken(cookie) as { userId?: string };
        if (payload?.userId) {
          await authService.logout(payload.userId);
        }
      }
    } catch (err: unknown) {
      logger.warn("Logout: refresh token invalid", {
        error: (err as Error).message,
      });
    } finally {
      res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
      res.status(200).json({ success: true, message: "Logged out" });
    }
  }
);
