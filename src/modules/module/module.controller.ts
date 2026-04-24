import { NextFunction, Request, Response } from "express";
import * as svc from "./module.service";
import {
  createModuleSchema,
  listModulesQuerySchema,
  moduleParamsSchema,
  updateModuleSchema,
} from "./module.schema";
import { asyncHandler } from "../../utils/asyncHandler";

// export const createModuleController = async (req: Request, res: Response) => {
//   const { courseId } = req.params;
//   if (!courseId) throw badRequest("courseId is required");

//   const body = createModuleSchema.parse(req.body);
//   const mod = await svc.createModule({
//     ...body,
//     description: body.description ?? undefined,
//     courseId
//   });
//   res.status(201).json({ success: true, module: mod });
// };

export const createModuleController = asyncHandler(
  async (req: Request, res: Response) => {

    const { courseId } = moduleParamsSchema.parse(req.params);

    const body = createModuleSchema.parse(req.body);

    const module = await svc.createModule({
      ...body,
      courseId,
    });

    res.status(201).json({
      success: true,
      message: "Module created successfully",
      data: module,
    });
  },
);

export const listModulesController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = listModulesQuerySchema.parse(req.query);
    const courseId = req.params.courseId;
    const modules = await svc.listModulesForCourse(courseId as string, query);
    res.json({ success: true, ...modules });
  },
);

// export const getModuleController = asyncHandler(
//   async (req: Request, res: Response) => {
//     const module = await svc.getModule(req.params.id);

//     // Increment views for analytics
//     await svc.incrementModuleView(module.id);

//     res.json({ success: true, data: module });
//   },
// );

export const updateModuleController = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = updateModuleSchema.parse(req.body);
    const updated = await svc.updateModule(req.params.id as string, parsed);
    res.json({ success: true, data: updated });
  },
);

export const deleteModuleController = asyncHandler(
  async (req: Request, res: Response) => {
    await svc.deleteModule(req.params.id as string);
    res.json({ success: true, message: "Module deleted (soft)" });
  },
);

export const completeModuleController = asyncHandler(
  async (req: Request, res: Response) => {
    const completions = await svc.incrementModuleCompletion(req.params.id as string);
    res.json({ success: true, completions });
  },
);
