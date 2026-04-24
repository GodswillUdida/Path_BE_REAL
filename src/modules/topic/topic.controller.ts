import { Request, Response } from "express";
import * as svc from "./topic.service";
import {
  createTopicSchema,
  moduleParamsSchema,
  topicParamsSchema,
  updateTopicSchema,
} from "./topic.schema";
import { asyncHandler } from "../../utils/asyncHandler";
import { badRequest } from "../../utils/errors";

function normalizeResources(input: unknown): string[] | undefined {
  if (!input) return undefined;

  // Case 1: already array (frontend proper)
  if (Array.isArray(input)) {
    return input.map(String);
  }

  // Case 2: single string (form-data or single input)
  if (typeof input === "string") {
    const trimmed = input.trim();

    // Try JSON parse safely
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(String);
        }
      } catch {
        throw new Error("Invalid JSON format for resources");
      }
    }

    // fallback → treat as single value
    return [trimmed];
  }

  throw new Error("Invalid resources format");
}

export const createTopicController = asyncHandler(
  async (req: Request, res: Response) => {

    if (!req.file) {
      throw badRequest("Video file is required");
    }

    const normalized = {
      ...req.body,
      resources: normalizeResources(req.body.resources),
    };
    const { moduleId } = moduleParamsSchema.parse(req.params);
    const body = createTopicSchema.parse(normalized);

    const result = await svc.createTopic(moduleId, body, req.file!);
    // console.log(req.file);
    // console.log(req.file?.buffer?.length);

    res.status(201).json({ success: true, data: result });
  },
);

/* -------- GET SIGNED PLAYBACK -------- */
export const getPlaybackController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = topicParamsSchema.parse(req.params);

    const ip =
      req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
      req.socket.remoteAddress;

    // const userId = req.user?.id;

    // if (!userId) {
    //   throw badRequest("User authentication required");
    // }


    const url = await svc.generateSignedPlaybackUrl(id, req.user!.id, ip);

    res.json({
      success: true,
      playbackUrl: url,
    });
  },
);

/* -------- BUNNY WEBHOOK -------- */
export const bunnyWebhookController = asyncHandler(
  async (req: Request, res: Response) => {

    const signature = req.headers["bunny-signature"] as string;

    if (!signature) {
      return res.status(400).send("Missing signature");
    }

    const rawBody = req.body as Buffer;

    const isValid = svc.verifyBunnyWebhookSignature(
      rawBody,
      signature,
    );

    if (!isValid) {
      return res.status(401).send("Invalid signature");
    }

    const payload = JSON.parse(req.body.toString());
    await svc.handleBunnyWebhook(payload);

    // await svc.handleBunnyWebhook(req.body);
    res.status(200).send("OK");
  },
);

export const listTopicsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { moduleId } = moduleParamsSchema.parse(req.params);
    const topics = await svc.listTopicsForModule(moduleId);
    res.json({ success: true, data: topics });
  },
);

export const updateTopicController = asyncHandler(
  async (req: Request, res: Response) => {
    const body = updateTopicSchema.parse(req.body);
    const updated = await svc.updateTopic(req.params.id as string, body);
    res.json({ success: true, topic: updated });
  },
);

export const deleteTopicController = asyncHandler(
  async (req: Request, res: Response) => {
    await svc.deleteTopic(req.params.id as string);
    res.json({ success: true, message: "Topic deleted" });
  },
);
