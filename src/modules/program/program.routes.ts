/**
 * program.router.ts
 *
 * Mount point:
 *   /api/v1/programs
 *
 * Responsibilities:
 * - Define Program HTTP routes.
 * - Apply authentication/authorization middleware.
 * - Mount nested Course resources.
 *
 * Domain boundaries:
 *
 * Program service owns:
 *   - Program lifecycle
 *   - Program metadata
 *   - Publish/archive/restore
 *   - ProgramCourse ordering
 *
 * Course service owns:
 *   - Course creation
 *   - Course updates
 *   - Course deletion
 *   - Attaching existing courses to programs
 *   - Detaching courses from programs
 *
 * Important:
 * Course creation under a Program is a Course-domain operation.
 * This router therefore delegates nested course routes to course.router.
 *
 * Route ordering:
 *   Static routes MUST appear before parameterized routes.
 *
 *   GET /by-slug/:slug
 *   GET /:id
 *
 * The /by-slug prefix deliberately avoids the Express ambiguity between:
 *
 *   /:id
 *   /:slug
 *
 * Those two patterns are identical to Express.
 */

import { Router } from "express";

import * as ctrl from "./program.controller";

import { authGuard } from "@/middleware/authGuard";
import { roleGuard } from "@/middleware/roleGuard";
import { uploadSingleImage } from "@/config/multer";

// Course router.
// IMPORTANT:
// course.router MUST be created with mergeParams: true
// so req.params.programId survives the nested mount.
import courseRouter from "../course/course.routes";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — PROGRAM READS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/programs
 *
 * List programs.
 *
 * Optional query:
 *   ?q=
 *   ?status=
 *   ?limit=
 *   ?offset=
 */
router.get(
  "/",
  // rateLimiter({ windowMs: 60_000, max: 100 }),
  ctrl.listProgramsController,
);

/**
 * GET /api/v1/programs/by-slug/:slug
 *
 * Get a Program using its public slug.
 *
 * Static prefix intentionally comes before /:id.
 */
router.get(
  "/by-slug/:slug",
  // rateLimiter({ windowMs: 60_000, max: 100 }),
  ctrl.getProgramBySlugController,
);

/**
 * GET /api/v1/programs/:id
 *
 * Get Program by ID.
 *
 * Keep this after all static GET routes.
 */
router.get(
  "/:id",
  // rateLimiter({ windowMs: 60_000, max: 120 }),
  ctrl.getProgramController,
);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED — PROGRAM CREATION / UPDATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/programs
 *
 * Create Program.
 *
 * Admin-only.
 */
router.post(
  "/",
  // rateLimiter({ windowMs: 60_000, max: 10 }),
  authGuard,
  roleGuard("admin", "superadmin"),
  uploadSingleImage,
  ctrl.createProgramController,
);

/**
 * PATCH /api/v1/programs/:id
 *
 * Update Program metadata.
 *
 * This route should NOT be used as a substitute for explicit lifecycle
 * operations such as publish/archive.
 */
router.patch(
  "/:id",
  // rateLimiter({ windowMs: 60_000, max: 20 }),
  authGuard,
  roleGuard("admin", "superadmin"),
  uploadSingleImage,
  ctrl.updateProgramController,
);

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAM LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/programs/:id/publish
 *
 * Publish a Program.
 */
router.post(
  "/:id/publish",
  // rateLimiter({ windowMs: 60_000, max: 20 }),
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.publishProgramController,
);

/**
 * POST /api/v1/programs/:id/archive
 *
 * Archive a Program.
 */
router.post(
  "/:id/archive",
  // rateLimiter({ windowMs: 60_000, max: 20 }),
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.archiveProgramController,
);

/**
 * POST /api/v1/programs/:id/restore
 *
 * Restore a soft-deleted Program.
 */
router.post(
  "/:id/restore",
  // rateLimiter({ windowMs: 60_000, max: 20 }),
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.restoreProgramController,
);

/**
 * DELETE /api/v1/programs/:id
 *
 * Soft-delete Program.
 */
router.delete(
  "/:id",
  // rateLimiter({ windowMs: 60_000, max: 10 }),
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.deleteProgramController,
);

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAM CURRICULUM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/programs/:id/courses/reorder
 *
 * Reorder Course membership within a Program.
 *
 * Example body:
 *
 * {
 *   "courseId": "course-id",
 *   "position": 2
 * }
 *
 * Program service owns this operation because ordering belongs to the
 * ProgramCourse curriculum relationship.
 */
router.patch(
  "/:id/courses/reorder",
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.reorderProgramCourseController,
);

// ─────────────────────────────────────────────────────────────────────────────
// NESTED COURSE RESOURCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Everything below this mount belongs to the Course domain.
 *
 * Example resulting endpoints:
 *
 * POST   /api/v1/programs/:programId/courses
 * GET    /api/v1/programs/:programId/courses
 * GET    /api/v1/programs/:programId/courses/:courseId
 * PATCH  /api/v1/programs/:programId/courses/:courseId
 * DELETE /api/v1/programs/:programId/courses/:courseId
 *
 * The Course router is responsible for deciding which operations require
 * instructor/admin permissions.
 *
 * The Program router is only providing the parent resource context.
 */
router.use(
  "/:programId/courses",
  courseRouter,
);

export default router;