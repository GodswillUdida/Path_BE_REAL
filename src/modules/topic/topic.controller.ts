/**
 * topic.controller.ts
 *
 * Thin HTTP adapters for the Topic domain.
 * - Validates params / body via Zod
 * - Extracts multipart files (video + resources)
 * - Delegates all business logic to topic.service.ts
 * - Never talks to Prisma or Bunny directly
 */

import { Request, Response } from "express";
import * as svc from "./topic.service";
import {
  bunnyWebhookSchema,
  createTopicSchema,
  moduleParamsSchema,
  topicParamsSchema,
  updateTopicSchema,
} from "./topic.schema";
import { asyncHandler } from "../../utils/asyncHandler";
import { badRequest } from "../../utils/errors";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type MulterFiles = {
  video?: Express.Multer.File[];
  resourceFiles?: Express.Multer.File[];
};

function extractFiles(req: Request): {
  video: Express.Multer.File | undefined;
  resourceFiles: Express.Multer.File[];
} {
  const files = req.files as MulterFiles | undefined;
  return {
    video: files?.video?.[0],
    resourceFiles: files?.resourceFiles ?? [],
  };
}

function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim();
  }
  return req.socket.remoteAddress;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// POST /modules/:moduleId/topics
// multipart: video (required), resources (optional, 0..n)
// body: title, position?, resources? (JSON array of metadata)
// header (optional): Idempotency-Key
// ─────────────────────────────────────────────────────────────────────────────

export const createTopicController = asyncHandler(
  async (req: Request, res: Response) => {
    const { moduleId } = moduleParamsSchema.parse(req.params);
    const body = createTopicSchema.parse(req.body);

    const { video, resourceFiles } = extractFiles(req);
    if (!video) {
      throw badRequest("Video file is required");
    }

    const idempotencyKey =
      (req.headers["idempotency-key"] as string | undefined) ?? undefined;

    const topic = await svc.createTopic(
      moduleId,
      body,
      video,
      resourceFiles,
      idempotencyKey,
    );

    res.status(201).json({ success: true, data: topic });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// GET /modules/:moduleId/topics
// ─────────────────────────────────────────────────────────────────────────────

export const listTopicsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { moduleId } = moduleParamsSchema.parse(req.params);
    const topics = await svc.listTopicsForModule(moduleId);
    res.json({ success: true, data: topics });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// PATCH /topics/:id
// multipart (optional): resources (new file uploads for ADD entries)
// body: title?, position?, resources? (JSON array of UPDATE/ADD ops)
// ─────────────────────────────────────────────────────────────────────────────

export const updateTopicController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = topicParamsSchema.parse(req.params);
    const body = updateTopicSchema.parse(req.body);

    const { resourceFiles } = extractFiles(req);

    await svc.updateTopic(id, body, resourceFiles);

    res.json({ success: true, message: "Topic updated" });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// DELETE /topics/:id
// ─────────────────────────────────────────────────────────────────────────────

export const deleteTopicController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = topicParamsSchema.parse(req.params);
    await svc.deleteTopic(id);
    res.json({ success: true, message: "Topic deleted" });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// SIGNED PLAYBACK
// GET /topics/:id/playback
// ─────────────────────────────────────────────────────────────────────────────

export const getPlaybackController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = topicParamsSchema.parse(req.params);

    if (!req.user?.id) {
      // Defensive — auth middleware should already have rejected this
      throw badRequest("Authentication required");
    }

    const url = await svc.generateSignedPlaybackUrl(
      id,
      req.user.id,
      getClientIp(req),
    );

    res.json({ success: true, data: { playbackUrl: url } });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// BUNNY STREAM WEBHOOK
// POST /webhooks/bunny
// raw body (Buffer) required for signature verification
// ─────────────────────────────────────────────────────────────────────────────

export const bunnyWebhookController = asyncHandler(
  async (req: Request, res: Response) => {
    const signature = req.headers["x-bunnystream-signature"] as
      | string
      | undefined;
    const version = req.headers["x-bunnystream-signature-version"] as
      | string
      | undefined;
    const algorithm = req.headers["x-bunnystream-signature-algorithm"] as
      | string
      | undefined;

    if (!signature || !version || !algorithm) {
      return res.status(400).send("Missing signature headers");
    }

    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).send("Expected raw body");
    }

    const isValid = svc.verifyBunnyWebhookSignature(
      rawBody,
      signature,
      version,
      algorithm,
    );
    if (!isValid) {
      return res.status(401).send("Invalid signature");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf-8"));
    } catch {
      return res.status(400).send("Malformed JSON");
    }

    const parsed = bunnyWebhookSchema.safeParse(payload);
    if (!parsed.success) {
      return res.status(400).send("Malformed payload");
    }

    await svc.handleBunnyWebhook(parsed.data);
    res.status(200).send("OK");
  },
);
