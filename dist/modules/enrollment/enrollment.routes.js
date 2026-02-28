"use strict";
// enrollment.router.ts
// Rewritten & Enhanced — February 2026
// Senior Engineer @ modern TypeScript/Express stack
// Perfectly aligned with enrollment.controller.ts + enrollment.service.ts (2026 versions)
// • Removed all dead/commented code (validate middleware, physical routes, unused schema import)
// • Consistent function names (getOne → getOneEnrollment)
// • Clear route documentation
// • Production-ready structure (named router, explicit imports, semantic ordering)
// • Ready for future middleware (rate-limit, OpenAPI, etc.)
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const enrollment_controller_1 = require("./enrollment.controller");
const authGuard_1 = require("../../middleware/authGuard");
const router = (0, express_1.Router)();
/**
 * POST /enrollments
 * Create single or bulk enrollments (cart/checkout flow)
 * Body: CreateEnrollmentSchema (single object or array)
 * Protected: authGuard
 */
router.post("/", authGuard_1.authGuard, enrollment_controller_1.createEnrollment);
/**
 * GET /enrollments/mine
 * Return all enrollments for the authenticated user
 * Protected: authGuard
 */
router.get("/mine", authGuard_1.authGuard, enrollment_controller_1.getMyEnrollments);
/**
 * GET /enrollments/:id
 * Return a single enrollment by ID (ownership enforced in service)
 * Protected: authGuard
 */
router.get("/:id", authGuard_1.authGuard, enrollment_controller_1.getOneEnrollment);
exports.default = router;
