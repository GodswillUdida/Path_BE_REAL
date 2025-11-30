import { Router } from "express";
import * as ctrl from "./topic.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";

const r = Router({ mergeParams: true });

// Public: list topics for a module
r.get("/module/:moduleId", ctrl.listTopicsController);

// Admin / instructor
r.post(
  "/",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.createTopicController
);
r.patch(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.updateTopicController
);
r.delete(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.deleteTopicController
);

export default r;
