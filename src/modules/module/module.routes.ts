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

// Any authenticated learner marks completion on a module they're
// progressing through — not instructor/admin-gated like the routes above.
// Previously commented out and missing its handler reference entirely
// (`authGuard,` with nothing after it) — the controller and service
// function already existed with no route ever calling them.
r.post("/complete/:id", authGuard, ctrl.completeModuleController);

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

export default r;