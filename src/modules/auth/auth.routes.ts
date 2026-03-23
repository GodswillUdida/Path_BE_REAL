/**
 * @file auth.routes.ts
 * @description Auth router.
 *
 * Route conventions:
 *   POST   → create / mutate state
 *   GET    → read-only queries
 *   DELETE → explicit removal (session revocation)
 *
 * Guard layers:
 *   authGuard  → verifies access token, attaches req.user
 *   roleGuard  → asserts req.user.role is in the allowed set
 */

import { Router } from "express";
import * as authController from "./auth.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";

const r = Router();

// ─── Public: Credentials ──────────────────────────────────────────────────────

r.post("/register", authController.registerController);
r.post("/login", authController.loginController);
r.post("/verify-email", authController.verifyEmailController);
r.post("/refresh", authController.refreshTokenController);

// ─── Public: Password Reset ───────────────────────────────────────────────────

r.post("/forgot-password", authController.forgotPasswordController);
r.post("/reset-password", authController.resetPasswordController);

// ─── Public: Google OAuth (Redirect Flow) ─────────────────────────────────────
//
//  Step 1 — Browser visits GET /api/auth/google
//           → redirected to Google's consent screen
//
//  Step 2 — Google redirects back to GET /api/auth/google/callback?code=…
//           → server exchanges code, sets cookie, redirects to frontend

r.get("/google", authController.startGoogleOAuthController);
r.get("/google/callback", authController.googleCallbackController);

// ─── Public: Magic Link ───────────────────────────────────────────────────────

r.post("/magic-login/send", authController.sendMagicLoginController);
r.post("/magic-login/verify", authController.verifyMagicLoginController);

// ─── Public: Guest OTP & Login ────────────────────────────────────────────────

r.post("/guest-otp/send", authController.sendGuestOtpController);
r.post("/guest-otp/verify", authController.verifyGuestOtpController);
r.post("/guest-login", authController.guestLoginController);

// ─── Authenticated ────────────────────────────────────────────────────────────

r.get("/me", authGuard, authController.getMeController);
r.post("/logout", authGuard, authController.logoutController);
r.post("/logout-all", authGuard, authController.logoutAllController);
r.get("/sessions", authGuard, authController.getSessionsController);
r.delete("/sessions/:id", authGuard, authController.revokeSessionController);

// ─── Admin ────────────────────────────────────────────────────────────────────

r.get(
  "/users",
  authGuard,
  roleGuard("admin", "superadmin"),
  authController.getAllUsersController,
);

export default r;
