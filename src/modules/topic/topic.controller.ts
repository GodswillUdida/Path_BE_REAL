import { Request, Response } from "express";
import * as svc from "./topic.service";
import {
  createTopicSchema,
  moduleParamsSchema,
  topicParamsSchema,
  updateTopicSchema,
} from "./topic.schema";
import { asyncHandler } from "../../utils/asyncHandler";

export const createTopicController = asyncHandler(
  async (req: Request, res: Response) => {
    const { moduleId } = moduleParamsSchema.parse(req.params);
    const body = createTopicSchema.parse(req.body);
    const topic = await svc.createTopic(moduleId, body);
    res.status(201).json({ success: true, data: topic });
  },
);

/* -------- GET SIGNED PLAYBACK -------- */
export const getPlaybackController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = topicParamsSchema.parse(req.params);

    const url = await svc.generateSignedPlaybackUrl(id, req.user!.id);

    res.json({
      success: true,
      playbackUrl: url,
    });
  },
);

/* -------- BUNNY WEBHOOK -------- */
export const bunnyWebhookController = asyncHandler(
  async (req: Request, res: Response) => {

    // const signature = req.headers["bunny-signature"] as string;

    // if (!signature) {
    //   return res.status(400).send("Missing signature");
    // }

    // const isValid = svc.verifyBunnyWebhookSignature(
    //   req.body as Buffer,
    //   signature,
    // );

    // if (!isValid) {
    //   return res.status(401).send("Invalid signature");
    // }

    // const payload = JSON.parse(req.body.toString());
    // await svc.handleBunnyWebhook(payload);

    await svc.handleBunnyWebhook(req.body);
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
