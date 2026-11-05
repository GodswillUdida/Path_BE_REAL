/**
 * @file auth.routes.ts
 *
 * Route conventions:
 *   POST   → create / mutate state
 *   GET    → read-only queries
 *   DELETE → explicit removal (session revocation)
 *
 * Guard layers:
 *   authGuard    → stateless; verifies Bearer access token, attaches req.user
 *   sessionGuard → stateful; verifies refresh cookie + DB session hash
 *   roleGuard    → asserts req.user.role is in the allowed set (after authGuard)
 *
 * Rate limiting:
 *   A broad 100 req/15 min limiter is applied to all /api/* routes in app.ts.
 *   Sensitive auth endpoints get tighter, targeted limiters here that sit
 *   in front of the broad one — whichever limit is hit first wins.
 */

import { Router, type RequestHandler } from "express";
import * as authController from "./auth.controller";
import { authGuard } from "../../middleware/authGuard";
import { sessionGuard } from "../../middleware/sessionGuard";
import { roleGuard } from "../../middleware/roleGuard";
import {
  credentialLimiter,
  otpLimiter,
} from "../../middleware/Ratelimiter.middleware";
import crypto from "crypto";
import { env } from "@/config/env";

// `passport` ships without bundled TypeScript declarations in this project setup,
// so use CommonJS require to avoid the "Could not find a declaration file" error.
const passport = require("passport");

const r = Router();

r.post("/register", 
  // credentialLimiter, 
  authController.registerController);
r.post("/login", 
  // credentialLimiter, 
  authController.loginController);
r.post("/refresh", 
  // credentialLimiter, 
  authController.refreshTokenController);

// ─── Public: Email Verification ──────────────────────────────────────────────

r.post("/verify-email", 
  // otpLimiter,
authController.verifyEmailController);
r.post(
  "/resend-verification-email",
  // otpLimiter,
  authController.resendVerificationEmailController,
);

// ─── Public: Password Reset ───────────────────────────────────────────────────

r.post("/forgot-password", otpLimiter, authController.forgotPasswordController);
r.get(
  "/reset-password/verify/:token",
  otpLimiter,
  authController.verifyPasswordResetTokenController,
);
r.post("/reset-password", otpLimiter, authController.resetPasswordController);

// ─── Google OAuth ────────────────────────────────────────────────────────
r.get("/google", (req, res, next) => {
  const state = crypto.randomBytes(24).toString("base64url");

  res.cookie("oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "none", // safer for most setups; change to "none" only if needed
    maxAge: 5 * 60 * 1000,
    path: "/",
  });

  passport.authenticate("google", {
    scope: ["openid", "profile", "email"],
    state,
    session: false,
  })(req, res, next);
});

r.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${env.FRONTEND_URL}/auth/login?error=google`,
  }),
  authController.googleCallbackController,
);

// ─── Authenticated: stateful session required ─────────────────────────────────

// sessionGuard validates the refresh cookie against the DB — suitable for
// endpoints that directly modify or inspect the caller's session state.

r.get("/me", sessionGuard, authController.getMeController);
r.post("/logout", sessionGuard, authController.logoutController);
r.post("/logout-all", sessionGuard, authController.logoutAllController);
r.get("/sessions", sessionGuard, authController.getSessionsController);
r.delete("/sessions/:id", sessionGuard, authController.revokeSessionController);

// ─── Admin ────────────────────────────────────────────────────────────────────
//
// authGuard is intentionally stateless here — admin tooling (dashboards, CLI
// scripts) typically presents short-lived access tokens, not session cookies.

r.get(
  "/users",
  authGuard,
  roleGuard("admin", "superadmin"),
  authController.getAllUsersController,
);

export default r;
