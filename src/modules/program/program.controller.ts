import { NextFunction, Request, Response } from "express";
import { createProgramSchema, updateProgramSchema } from "./program.schema";
import z from "zod";
import * as svc from "./program.service";
import { asyncHandler } from "../../utils/asyncHandler";

export const createProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const body = createProgramSchema.parse(req.body);
    const program = await svc.createProgram(body);

    res.status(201).json({
      success: true,
      message: "Program created successfully",
      program,
    });
  },
);

export const createCourseFromProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const { programId } = req.params;

    const course = await svc.createCourseFromProgramId({
      programId,
      type: req.body.type,
      payload: req.body,
      adminId: req.user.id,
      fileBuffer: req.file?.buffer,
      fileMime: req.file?.mimetype,
    });

    res.status(201).json({
      success: true,
      message: "Course created successfully",
      course,
    });
  },
);

export const listProgramsController = asyncHandler(
  async (_req: Request, res: Response) => {
    const programs = await svc.listPrograms();
    res.json({
      success: true,
      count: programs.length,
      programs,
    });
  },
);

export const getProgramController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const program = await svc.getProgram(id);

  res.status(200).json({
    success: true,
    program,
  });
});

export const getProgramBySlugController = asyncHandler(
  async (req: Request, res: Response) => {
    // const slugSchema = z.object({
    //   slug: z
    //     .string()
    //     .min(1)
    //     .max(255)
    //     .regex(/^[a-z0-9-]+$/i, "Invalid slug format"),
    // });
    const { slug } = req.params;

    const program = await svc.getProgramBySlug(slug);

    res.status(200).json({
      success: true,
      program,
    });
  },
);

export const updateProgramController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateProgramSchema.parse(req.body);

  const program = await svc.updateProgram(id, body);

  res.status(200).json({
    success: true,
    message: "Program updated successfully",
    program,
  });
});

export const deleteProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    await svc.deleteProgram(id);

    res.status(200).json({
      success: true,
      message: "Program deleted successfully",
    });
  },
);