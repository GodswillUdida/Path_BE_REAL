/**
 * course.router.ts
 *
 * Route ordering is load-bearing in Express — violating it causes
 * silent misrouting. The contract is documented inline.
 *
 * Middleware execution order per route:
 *   authGuard → roleGuard → upload (if any) → controller
 *
 * Rate limits can be layered in front per-route when needed:
 *   - Public GETs: higher limit (read-heavy, cached)
 *   - Writes / status transitions: tighter limit
 */

import { Router } from "express";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";
import { uploadCourseMedia } from "../../config/multer";
import * as ctrl from "./course.controller";

const router = Router();

const staff = roleGuard("admin", "superadmin", "instructor");

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE ORDERING CONTRACT
//
// Static segments before parameterized ones:
//   /slug/...     before  /:id
//   /:id/analytics before /:id
//   /:id/publish  before  /:id  (method differs, but keep nested paths first)
//
// POST /:programId is a write route with a different method than GET /:id,
// so they do not collide — still keep all GET /:id/* nested routes above GET /:id.
// ─────────────────────────────────────────────────────────────────────────────

// ─── PUBLIC — READ ───────────────────────────────────────────────────────────

router.get("/", ctrl.listCoursesController);

// Full path examples (when mounted at /courses):
//   GET /courses/slug/:programSlug/:courseSlug
//   GET /courses/slug/:courseSlug
router.get(
  "/slug/:programSlug/:courseSlug",
  ctrl.getCourseBySlugAndProgramController,
);

router.get("/slug/:courseSlug", ctrl.getCourseBySlugController);

router.get(
  "/:id/analytics",
  authGuard,
  staff,
  ctrl.courseAnalyticsController,
);

// Status transitions — nested under /:id, registered before plain /:id writes
router.post("/:id/publish", authGuard, staff, ctrl.publishCourseController);
router.post("/:id/unpublish", authGuard, staff, ctrl.unpublishCourseController);
router.post("/:id/archive", authGuard, staff, ctrl.archiveCourseController);

router.get("/:id", ctrl.getCourseController);

// ─── PROTECTED — WRITE ───────────────────────────────────────────────────────
//
// uploadCourseMedia = multer().fields([
//   { name: "thumbnail",    maxCount: 1 },
//   { name: "videoPreview", maxCount: 1 },
// ])
// → req.files.thumbnail[0], req.files.videoPreview[0]

/** Create a course linked to a program: POST /courses/:programId */
router.post(
  "/:programId",
  authGuard,
  staff,
  uploadCourseMedia,
  ctrl.createCourseController,
);

/**
 * Optional: standalone create without a program.
 * Uncomment only if you mount a static path that cannot collide with /:programId
 * e.g. POST /courses/standalone  — never POST / after POST /:programId.
 */
// router.post(
//   "/standalone",
//   authGuard,
//   staff,
//   uploadCourseMedia,
//   ctrl.createCourseController,
// );

router.patch(
  "/:id",
  authGuard,
  staff,
  uploadCourseMedia, // same fields as create — thumbnail + optional videoPreview
  ctrl.updateCourseController,
);

router.delete(
  "/:id",
  authGuard,
  staff,
  ctrl.deleteCourseController,
);

export default router;