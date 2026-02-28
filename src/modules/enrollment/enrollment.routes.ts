// enrollment.router.ts
// Rewritten & Enhanced — February 2026
// Senior Engineer @ modern TypeScript/Express stack
// Perfectly aligned with enrollment.controller.ts + enrollment.service.ts (2026 versions)
// • Removed all dead/commented code (validate middleware, physical routes, unused schema import)
// • Consistent function names (getOne → getOneEnrollment)
// • Clear route documentation
// • Production-ready structure (named router, explicit imports, semantic ordering)
// • Ready for future middleware (rate-limit, OpenAPI, etc.)

import { Router } from "express";
import {
  createEnrollment,
  getMyEnrollments,
  getOneEnrollment,
} from "./enrollment.controller";
import { authGuard } from "../../middleware/authGuard";

const router = Router();

/**
 * POST /enrollments
 * Create single or bulk enrollments (cart/checkout flow)
 * Body: CreateEnrollmentSchema (single object or array)
 * Protected: authGuard
 */
router.post("/", authGuard, createEnrollment);

/**
 * GET /enrollments/mine
 * Return all enrollments for the authenticated user
 * Protected: authGuard
 */
router.get("/mine", authGuard, getMyEnrollments);

/**
 * GET /enrollments/:id
 * Return a single enrollment by ID (ownership enforced in service)
 * Protected: authGuard
 */
router.get("/:id", authGuard, getOneEnrollment);

export default router;
