import { Router } from "express";
import * as authController from "./auth.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";

const r = Router();

r.post("/guest-login", authController.guestLoginController);
r.post("/register", authController.registerController);
r.post("/login", authController.loginController);
r.post("/verify-email", authController.verifyEmailController);
r.post("/forgot-password", authController.forgotPasswordController);
r.post("/reset-password", authController.resetPasswordController);
r.post("/refresh", authController.refreshTokenController);

// Authenticated
r.post("/logout", authGuard, authController.logoutController);
r.get("/sessions", authGuard, authController.getSessionsController);
r.delete("/sessions/:id", authGuard, authController.revokeSessionController);
r.post("/logout-all", authGuard, authController.logoutAllController);

// Protected test route with role
r.get("/me", authGuard, authController.getUserByIdController);

r.get( "/users", authGuard, roleGuard("admin", "superadmin"), authController.getAllUsersController,
);

// r.get( "/user/:id", authGuard, roleGuard("admin", "superadmin"), authController.getUserByIdController,);

export default r;
