import { Router } from "express";
import * as ctrl from "./course.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";
import uploadImage from "../../config/multer";
import { generalRateLimiter } from "../../middleware/Ratelimiter.middleware";


const r = Router();

/**
 * --------------------------------
 * Public Routes
 * --------------------------------
 */

// List courses (cached)
r.get("/",
  generalRateLimiter,
  ctrl.listCoursesController);

// Get single course by ID
r.get("/:id",
  generalRateLimiter,
  ctrl.getCourseController);

// Get by slug (program + course)
r.get("/:programSlug/:courseSlug", generalRateLimiter, ctrl.getCourseBySlugController);

/**
 * --------------------------------
 * Protected Routes
 * --------------------------------
 */

// Create course (unified)
r.post(
  "/:programId",
  generalRateLimiter,
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  uploadImage.single("thumbnail"),
  ctrl.createCourseController,
);

// Update
r.patch(
  "/:id",
  generalRateLimiter,
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  uploadImage.single("thumbnail"),
  ctrl.updateCourseController,
);

// Soft delete
r.delete(
  "/:id",
  generalRateLimiter,
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.deleteCourseController,
);

// Course analytics
r.get(
  "/:id/analytics",
  generalRateLimiter,
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.courseAnalyticsController,
);

export default r;
