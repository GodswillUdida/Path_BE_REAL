import { Request, Response } from "express";
import * as svc from "./topic.service";
import { createTopicSchema, updateTopicSchema } from "./topic.schema";

export const createTopicController = async (req: Request, res: Response) => {
  const body = createTopicSchema.parse(req.body);
  const topic = await svc.createTopic(body);
  res.status(201).json({ success: true, topic });
};

export const listTopicsController = async (req: Request, res: Response) => {
  const moduleId = req.params.moduleId;
  const topics = await svc.listTopicsForModule(moduleId);
  res.json({ success: true, topics });
};

export const updateTopicController = async (req: Request, res: Response) => {
  const body = updateTopicSchema.parse(req.body);
  const updated = await svc.updateTopic(req.params.id, body);
  res.json({ success: true, topic: updated });
};

export const deleteTopicController = async (req: Request, res: Response) => {
  await svc.deleteTopic(req.params.id);
  res.json({ success: true, message: "Topic deleted" });
};