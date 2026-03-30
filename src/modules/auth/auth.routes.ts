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

import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as authController from "./auth.controller";
import { authGuard } from "../../middleware/authGuard";
import { sessionGuard } from "../../middleware/sessionGuard";
import { roleGuard } from "../../middleware/roleGuard";
import passport from "../../config/passport";

const r = Router();

// ─── Targeted Rate Limiters ───────────────────────────────────────────────────
//
// These complement the broad /api limiter in app.ts. The narrow window and low
// ceiling on credential and OTP endpoints make brute-force attacks impractical
// without blocking legitimate use.

/** 10 attempts per 15 min per IP — covers credential brute-force. */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again later." },
});

/** 5 attempts per 15 min per IP — covers OTP/magic-link spam. */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

// ─── Public: Credentials ──────────────────────────────────────────────────────

r.post("/register", credentialLimiter, authController.registerController);
r.post("/login",    credentialLimiter, authController.loginController);
r.post("/refresh",  credentialLimiter, authController.refreshTokenController);

// ─── Public: Email Verification ──────────────────────────────────────────────

r.post("/verify-email",             otpLimiter, authController.verifyEmailController);
r.post("/resend-verification-email", otpLimiter, authController.resendVerificationEmailController);

// ─── Public: Password Reset ───────────────────────────────────────────────────

r.post("/forgot-password", otpLimiter, authController.forgotPasswordController);
r.post("/reset-password",  otpLimiter, authController.resetPasswordController);

// ─── Public: Google OAuth (Redirect Flow) ─────────────────────────────────────
//
//  Step 1 — Browser visits GET /api/auth/google
//           → redirected to Google's consent screen
//
//  Step 2 — Google redirects to GET /api/auth/google/callback?code=…
//           → server exchanges code, sets cookie, redirects to frontend

r.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  }),
);

r.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/auth/login?error=google_failed`,
  }),
  // authController.googleCallbackController,
);

// ─── Public: Magic Link ───────────────────────────────────────────────────────

r.post("/magic-login/send",   otpLimiter, authController.sendMagicLoginController);
r.post("/magic-login/verify", otpLimiter, authController.verifyMagicLoginController);

// ─── Public: Guest OTP & Login ────────────────────────────────────────────────

r.post("/guest-otp/send",   otpLimiter,      authController.sendGuestOtpController);
r.post("/guest-otp/verify", otpLimiter,      authController.verifyGuestOtpController);
r.post("/guest-login",      credentialLimiter, authController.guestLoginController);

// ─── Authenticated: stateful session required ─────────────────────────────────
//
// sessionGuard validates the refresh cookie against the DB — suitable for
// endpoints that directly modify or inspect the caller's session state.

r.get(   "/me",              sessionGuard, authController.getMeController);
r.post(  "/logout",          sessionGuard, authController.logoutController);
r.post(  "/logout-all",      sessionGuard, authController.logoutAllController);
r.get(   "/sessions",        sessionGuard, authController.getSessionsController);
r.delete("/sessions/:id",    sessionGuard, authController.revokeSessionController);

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