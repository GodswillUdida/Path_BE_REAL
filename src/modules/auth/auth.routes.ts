import { Router } from "express";
import * as ctrl from "./auth.controller";

// {
//   registerController,
//   loginController,
//   verifyEmailController,
//   forgotPasswordController,
//   resetPasswordController,
//   refreshTokenController,
//   logoutController,
// }

const r = Router();

r.post("/register", ctrl.registerController);
r.post("/login", ctrl.loginController);
r.post("/verify-email", ctrl.verifyEmailController);
r.post("/forgot-password", ctrl.forgotPasswordController);
r.post("/reset-password", ctrl.resetPasswordController);
r.post("/refresh", ctrl.refreshTokenController);
r.post("/logout", ctrl.logoutController);

export default r;
