/**
 * program.router.ts
 *
 * Mount point: /api/v1/programs
 *
 * ROUTE ORDERING CONTRACT
 * ───────────────────────
 * Express matches top-to-bottom. Static segments MUST precede parameterized ones.
 *
 *   ✅ GET /by-slug/:slug   → before  /:id  (different prefix — no shadow)
 *   ✅ GET /:id             → catchall dynamic segment, registered last
 *
 * THE BUG IN THE ORIGINAL:
 *   GET /:id   and   GET /:slug   are IDENTICAL to Express.
 *   The second registration is silently unreachable.
 *   Fix: use a static prefix for the slug route (/by-slug/:slug).
 *
 * CROSS-DOMAIN ACTIONS (course creation under a program):
 * ────────────────────────────────────────────────────────
 * Course creation is NOT handled here. It was in the original — that's a
 * domain boundary violation. The course module owns course creation.
 * The course router accepts an optional programId route param:
 *   POST /api/v1/courses/:programId
 * This router links to the course router via a nested mount point below.
 *
 * ROLE BOUNDARIES:
 * ─────────────────
 * Programs are admin/superadmin territory.
 * Instructors create and manage courses within programs — not programs.
 * The original allowed instructors to create programs — removed.
 */

import { Router }           from "express";
import * as ctrl            from "./program.controller";
import { authGuard } from "@/middleware/authGuard";
import { roleGuard } from "@/middleware/roleGuard";
import { uploadSingleImage } from "@/config/multer";

// Course router — mounted under /:programId/courses for nested resource access
// Handles: POST /:programId/courses, GET /:programId/courses, etc.

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — READ
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/",
  // rateLimiter({ windowMs: 60_000, max: 100 }),
  ctrl.listProgramsController,
);

// Static prefix prevents shadowing /:id — this route is always reachable
router.get(
  "/by-slug/:slug",
  // rateLimiter({ windowMs: 60_000, max: 100 }),
  ctrl.getProgramBySlugController,
);

// Registered AFTER /by-slug/:slug — no conflict
router.get(
  "/:id",
  // rateLimiter({ windowMs: 60_000, max: 120 }),
  ctrl.getProgramController,
);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED — WRITE (admin / superadmin only)
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/",
  // rateLimiter({ windowMs: 60_000, max: 10 }),
  authGuard,
  roleGuard("admin", "superadmin"),
  uploadSingleImage, // optional — for program cover image
  ctrl.createProgramController,
);

router.patch(
  "/:id",
  // rateLimiter({ windowMs: 60_000, max: 20 }),
  authGuard,
  roleGuard("admin", "superadmin"),
  uploadSingleImage,
  ctrl.updateProgramController,
);

router.delete(
  "/:id",
  // rateLimiter({ windowMs: 60_000, max: 10 }),
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.deleteProgramController,
);

// ─────────────────────────────────────────────────────────────────────────────
// NESTED RESOURCE — COURSES UNDER A PROGRAM
//
// Delegates to the course router with programId available as a route param.
// The course controller reads req.params.programId and passes it to the
// course service — no cross-module service calls from this router.
//
// Full paths:
//   POST   /programs/:programId/courses        → create course in program
//   GET    /programs/:programId/courses        → list courses in program
//   PATCH  /programs/:programId/courses/:id   → update course
//   DELETE /programs/:programId/courses/:id   → delete course
// ─────────────────────────────────────────────────────────────────────────────

// router.use("/:programId/courses", courseRouter);

export default router;