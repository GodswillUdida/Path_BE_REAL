import { Router } from "express";
import * as authController from "./auth.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";

const r = Router();

/* --------------------------
   PUBLIC AUTH
---------------------------*/

r.post("/register", authController.registerController);
r.post("/login", authController.loginController);

r.post("/verify-email", authController.verifyEmailController);
r.post("/forgot-password", authController.forgotPasswordController);
r.post("/reset-password", authController.resetPasswordController);

r.post("/refresh", authController.refreshTokenController);

/* --------------------------
   GOOGLE OAUTH
---------------------------*/

r.get("/google", authController.googleAuthController);
// router.get('/auth/google/callback',


/* --------------------------
   MAGIC LOGIN
---------------------------*/

r.post("/magic-login/send", authController.sendMagicLoginController);
r.post("/magic-login/verify", authController.verifyMagicLoginController);

/* --------------------------
   GUEST CHECKOUT LOGIN
---------------------------*/

r.post("/guest-otp/send", authController.sendGuestOtpController);
r.post("/guest-otp/verify", authController.verifyGuestOtpController);
r.post("/guest-login", authController.guestLoginController);

/* --------------------------
   AUTHENTICATED
---------------------------*/

r.post("/logout", authGuard, authController.logoutController);
r.post("/logout-all", authGuard, authController.logoutAllController);

r.get("/sessions", authGuard, authController.getSessionsController);
r.delete("/sessions/:id", authGuard, authController.revokeSessionController);

r.get("/me", authGuard, authController.getUserByIdController);

/* --------------------------
   ADMIN
---------------------------*/

r.get(
  "/users",
  authGuard,
  roleGuard("admin", "superadmin"),
  authController.getAllUsersController,
);

export default r;
