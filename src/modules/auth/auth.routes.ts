import { Router } from "express";
import * as ctrl from "./auth.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";

const r = Router();

r.post("/register", ctrl.registerController);
r.post("/login", ctrl.loginController);
r.post("/verify-email", ctrl.verifyEmailController);
r.post("/forgot-password", ctrl.forgotPasswordController);
r.post("/reset-password", ctrl.resetPasswordController);
r.post("/refresh", ctrl.refreshTokenController);

// Authenticated
r.post("/logout", authGuard, ctrl.logoutController);
r.get("/sessions", authGuard, ctrl.getSessionsController);
r.delete("/sessions/:id", authGuard, ctrl.revokeSessionController);
r.delete("/sessions", authGuard, ctrl.logoutAllController);

// Protected test route with role
r.get(
  "/admin-only",
  authGuard,
  roleGuard("admin", "superadmin"),
  (_req, res) => {
    res.json({ success: true, message: "Welcome admin!" });
  },
);

export default r;
