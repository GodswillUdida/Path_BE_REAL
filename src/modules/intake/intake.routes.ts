import { Router } from "express";
import { authGuard } from "@/middleware/authGuard";
import { optionalAuth } from "@/middleware/optionalAuth";
import { roleGuard } from "@/middleware/roleGuard";
import prisma from "@/lib/prisma";
import {
  intakeRegisterLimiter,
  intakeResendLimiter,
  intakeVerifyLimiter,
} from "@/middleware/Ratelimiter.middleware";
import { createIntakeControllers } from "./intake.controller";

const router = Router();

const {
  registerApplicantController,
  verifyRegistrationController,
  resendRegistrationController,
  listApplicantsController,
  getApplicantController,
  updateApplicantController,
  updateApplicantStatusController,
  deleteApplicantController,
  getStatsController,
} = createIntakeControllers(prisma);

// Public registration with optional session. Anonymous: password is set only on /register/verify.
router.post("/register", intakeRegisterLimiter, optionalAuth, registerApplicantController);
// Anonymous applicants prove email ownership here; only then is the account created.
router.post("/register/verify", intakeVerifyLimiter, verifyRegistrationController);
router.post("/register/resend", intakeResendLimiter, resendRegistrationController);

router.get(
  "/stats",
  authGuard,
  roleGuard("admin", "superadmin"),
  getStatsController,
);
router.get(
  "/",
  authGuard,
  roleGuard("admin", "superadmin"),
  listApplicantsController,
);
router.get(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin"),
  getApplicantController,
);
router.put(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin"),
  updateApplicantController,
);
router.patch(
  "/:id/status",
  authGuard,
  roleGuard("admin", "superadmin"),
  updateApplicantStatusController,
);
router.delete(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin"),
  deleteApplicantController,
);

export default router;
