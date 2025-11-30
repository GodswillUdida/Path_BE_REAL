import { Router } from "express";
import * as ctrl from "./course.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";

const r = Router();

// Public
r.get("/", ctrl.listCoursesController);
r.get("/:id", ctrl.getCourseController);

// Admin/Instructors
r.post(
  "/",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.createCourseController
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
