import { Router } from "express";
import * as ctrl from "./course.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";
import uploadImage from "../../config/multer";

const r = Router();

/**
 * --------------------------------
 * Public Routes
 * --------------------------------
 */

// List courses (cached)
r.get("/", ctrl.listCoursesController);

// Get single course by ID
r.get("/:id", ctrl.getCourseController);

// Get by slug (program + course)
r.get("/:programSlug/:courseSlug", ctrl.getCourseBySlugController);

/**
 * --------------------------------
 * Protected Routes
 * --------------------------------
 */

// Create course (unified)
r.post(
  "/:programId",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  uploadImage.single("thumbnail"),
  ctrl.createCourseController,
);

// Update
r.patch(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  uploadImage.single("thumbnail"),
  ctrl.updateCourseController,
);

// Soft delete
r.delete(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.deleteCourseController,
);

// Course analytics
r.get(
  "/:id/analytics",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.courseAnalyticsController,
);

export default r;
