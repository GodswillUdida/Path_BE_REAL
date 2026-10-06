/**
 * topic.routes.ts
 *
 * Route map for the Topic domain.
 *
 * Mounting convention (recommended):
 *   app.use("/api/topics", topicRouter)          // list/create still need moduleId
 *   // OR split:
 *   app.use("/api/modules/:moduleId/topics", moduleScopedRouter)
 *   app.use("/api/topics", topicScopedRouter)
 *
 * This file assumes a single router mounted at `/api/topics` and uses
 * explicit path segments to avoid param collisions between moduleId and id.
 */

import { raw, Router } from "express";
import * as ctrl from "./topic.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";
import { createTopicRateLimiter } from "../../middleware/Ratelimiter.middleware";
import {
  enforceResourceSizeLimits,
  uploadTopicVideo,
} from "@/config/multer";

const router = Router({ mergeParams: true });
const staff = roleGuard("admin", "superadmin", "instructor");

// ─────────────────────────────────────────────────────────────────────────────
// Webhooks (no auth — signature verified inside the controller)
// Must be registered with raw body parser before any JSON parser middleware.
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/webhooks/bunny",
  raw({ type: "application/json", limit: "1mb" }),
  ctrl.bunnyWebhookController,
);

// ─────────────────────────────────────────────────────────────────────────────
// Module-scoped reads / writes
// GET  /api/topics/module/:moduleId
// POST /api/topics/module/:moduleId
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/:moduleId",
  ctrl.listTopicsController,
);

router.post(
  "/topics/:moduleId",
  createTopicRateLimiter,
  authGuard,
  staff,
  uploadTopicVideo,           // expects fields: video (1), resources (0..n)
  enforceResourceSizeLimits,
  ctrl.createTopicController,
);

// ─────────────────────────────────────────────────────────────────────────────
// Topic-scoped reads / writes
// GET    /api/topics/:id/playback
// PATCH  /api/topics/:id
// DELETE /api/topics/:id
//
// Static segments (playback) are declared before bare :id write routes
// so Express does not treat "playback" as an id value.
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/:id/playback",
  authGuard,
  ctrl.getPlaybackController,
);

router.patch(
  "/:id",
  authGuard,
  staff,
  uploadTopicVideo,           // optional — controller tolerates missing files
  enforceResourceSizeLimits,
  ctrl.updateTopicController,
);

router.delete(
  "/:id",
  authGuard,
  staff,
  ctrl.deleteTopicController,
);

export default router;