import { Request, Response } from "express";
import * as svc from "./module.service";
import {
  createModuleSchema,
  listModulesQuerySchema,
  moduleParamsSchema,
  moduleIdParamsSchema,
  updateModuleSchema,
} from "./module.schema";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";

export const createModuleController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = requireActor(req);
    const { courseId } = moduleParamsSchema.parse(req.params);
    const body = createModuleSchema.parse(req.body);

    const module = await svc.createModule({ ...body, courseId, actor });

    res.status(201).json({
      success: true,
      message: "Module created successfully",
      data: module,
    });
  },
);

export const listModulesController = asyncHandler(
  async (req: Request, res: Response) => {
    // Previously unvalidated — a malformed courseId just silently returned
    // an empty result set instead of a clean 400. Now validated the same
    // way createModuleController already validates it.
    const { courseId } = moduleParamsSchema.parse(req.params);
    const query = listModulesQuerySchema.parse(req.query);

    const modules = await svc.listModulesForCourse(courseId, query);
    res.json({ success: true, ...modules });
  },
);

export const updateModuleController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = requireActor(req);
    const { id } = moduleIdParamsSchema.parse(req.params);
    const data = updateModuleSchema.parse(req.body);

    const updated = await svc.updateModule({ id, actor, data });
    res.json({ success: true, data: updated });
  },
);

export const deleteModuleController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = requireActor(req);
    const { id } = moduleIdParamsSchema.parse(req.params);

    await svc.deleteModule({ id, actor });
    res.json({ success: true, message: "Module deleted (soft)" });
  },
);

export const completeModuleController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = moduleIdParamsSchema.parse(req.params);
    const completions = await svc.incrementModuleCompletion(id);
    res.json({ success: true, completions });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function requireActor(req: Request): { id: string; role: string } {
  const user = req.user;
  if (!user?.id || !user?.role) throw unauthorized("Authentication required");
  return { id: user.id, role: user.role };
}