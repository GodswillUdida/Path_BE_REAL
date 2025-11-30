import { Request, Response } from "express";
import * as svc from "./module.service";
import { createModuleSchema, updateModuleSchema } from "./module.schema";

export const createModuleController = async (req: Request, res: Response) => {
  const body = createModuleSchema.parse(req.body);
  const mod = await svc.createModule({ ...body, description: body.description ?? undefined });
  res.status(201).json({ success: true, module: mod });
};

export const listModulesController = async (req: Request, res: Response) => {
  const courseId = req.params.courseId;
  const list = await svc.listModulesForCourse(courseId);
  res.json({ success: true, modules: list });
};

export const updateModuleController = async (req: Request, res: Response) => {
  const body = updateModuleSchema.parse(req.body);
  const updated = await svc.updateModule(req.params.id, {
    description: body.description ?? undefined,
  });
  res.json({ success: true, module: updated });
};

export const deleteModuleController = async (req: Request, res: Response) => {
  await svc.deleteModule(req.params.id);
  res.json({ success: true, message: "Module removed" });
};