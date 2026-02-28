import { Router } from "express";
import * as ctrl from "./module.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";

const r = Router({ mergeParams: true });

// Public: list modules for a course
r.get("/:courseId", ctrl.listModulesController);

// Admin / instructor
r.post(
  "/:courseId",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.createModuleController,
);

r.patch(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.updateModuleController,
);
r.delete(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.deleteModuleController,
);

// r.post("/complete/:id", authGuard, );

export default r;
