/**
 * course.router.ts
 *
 * Route ordering is load-bearing in Express — violating it causes
 * silent misrouting. The contract is documented inline.
 *
 * Middleware execution order per route:
 *   rateLimiter → authGuard → roleGuard → parseJsonFields → uploadCourseMedia → controller
 *
 * Rate limits are intentionally asymmetric:
 *   - Public GETs: higher limit (read-heavy, cached)
 *   - Write operations: tighter limit (create/update/delete are expensive)
 */

import { Router } from "express";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";
import { uploadCourseMedia } from "../../config/multer";
import { parseJsonFields } from "../../utils/parseJsonFields";
import * as ctrl from "./course.controller";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE ORDERING CONTRACT
//
// ✅ Static segments before parameterized ones:
//    /by-slug/:a/:b    must come before  /:id
//    /:id/analytics    must come before  /:id
//
// Registering /:id before /:id/analytics would cause Express to match
// "analytics" as an id value — the analytics route becomes unreachable.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — READ
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/",
  ctrl.listCoursesController,
);

// Slug-based lookup.
// Mounted under /courses — full path: GET /courses/by-slug/:programSlug/:courseSlug
// Alternatively this can be mounted at the program router level for cleaner URLs.
router.get(
  "/slug/:programSlug/:courseSlug",
  ctrl.getCourseBySlugController,
);

// MUST be before /:id — see ordering contract above
router.get(
  "/:id/analytics",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.courseAnalyticsController,
);

router.get(
  "/:id",
  ctrl.getCourseController,
);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED — WRITE
//
// uploadCourseMedia = multer().fields([
//   { name: "thumbnail",    maxCount: 1 },
//   { name: "videoPreview", maxCount: 1 },
// ])
// → req.files.thumbnail[0], req.files.videoPreview[0]
// See: config/multer.ts
// ─────────────────────────────────────────────────────────────────────────────

  // router.post(
  //   "/:programId",
  //   authGuard,
  //   roleGuard("admin", "superadmin", "instructor"),
  //   uploadCourseMedia,
  //   ctrl.createCourseController,
  // );


  router.post(
  "/:programId",
  // rateLimiter({ windowMs: 60_000, max: 10 }),
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  uploadCourseMedia,       // ← multer first: parses multipart body into req.body + req.files
  // parseJsonFields(["pricings"]), // ← then parse JSON strings inside that body
  ctrl.createCourseController,
);


router.patch(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  uploadCourseMedia,
  ctrl.updateCourseController,
);

router.delete(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.deleteCourseController,
);

export default router;