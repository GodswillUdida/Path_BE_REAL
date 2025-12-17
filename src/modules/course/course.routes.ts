import { Router } from "express";
import * as ctrl from "./course.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";
import uploadImage from "../../config/multer";

const r = Router();

// Public
r.get("/", ctrl.listCoursesController);
r.get("/:id", ctrl.getCourseController);
r.get("/:programSlug/:courseSlug", ctrl.getCourseBySlugController);

r.post(
  "/:programSlug/courses/online",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  uploadImage.single("thumbnail"),
  ctrl.createOnlineCourseController
);

r.post(
  "/:programSlug/courses/physical",
  uploadImage.single("thumbnail"),
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.createPhysicalCourseController
);

r.patch(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.updateCourseController
);

r.delete(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.deleteCourseController
);

export default r;
