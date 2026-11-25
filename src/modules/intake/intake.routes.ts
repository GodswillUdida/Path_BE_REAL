import { Router } from "express";
import { authGuard } from "@/middleware/authGuard";
import { optionalAuth } from "@/middleware/optionalAuth";
import { roleGuard } from "@/middleware/roleGuard";
import prisma from "@/lib/prisma";
import { createIntakeControllers } from "./intake.controller";

const router = Router();

const {
  registerApplicantController,
  listApplicantsController,
  getApplicantController,
  updateApplicantController,
  updateApplicantStatusController,
  deleteApplicantController,
  getStatsController,
} = createIntakeControllers(prisma);

// Public registration with optional session (authenticated applicants skip password).
router.post("/register", optionalAuth, registerApplicantController);

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
