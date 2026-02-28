import { raw, Router } from "express";
import * as ctrl from "./topic.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";

const r = Router({ mergeParams: true });

// Public: list topics for a module
r.get("/module/:moduleId", ctrl.listTopicsController);

// Admin / instructor
r.post(
  "/:moduleId",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.createTopicController,
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

/* Get Secure Playback */
r.get(
  "/:id/play",
  authGuard,
  ctrl.getPlaybackController
);

/* Bunny Webhook */
r.post("/webhooks/bunny", raw({ type: "application/json" }), ctrl.bunnyWebhookController);

export default r;
