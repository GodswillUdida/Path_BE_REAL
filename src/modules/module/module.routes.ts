import { Router } from "express";
import * as ctrl from "./module.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";

const r = Router({ mergeParams: true });

// Public: list modules for a course
r.get("/course/:courseId", ctrl.listModulesController);

// Admin / instructor
r.post(
  "/",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.createModuleController
);
r.patch(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.updateModuleController
);
r.delete(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.deleteModuleController
);

export default r;
