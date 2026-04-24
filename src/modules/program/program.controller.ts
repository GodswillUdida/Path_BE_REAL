import { Request, Response } from "express";
import { createProgramSchema, updateProgramSchema } from "./program.schema";
import * as svc from "./program.service";
import { asyncHandler } from "../../utils/asyncHandler";
import { enforceIdempotency } from "../../utils/idempotency";

export const createProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const existing = await enforceIdempotency(
      req.headers["idempotency-key"] as string,
      "create_program",
    );

    if (existing?.response) {
      return res.status(existing.statusCode!).json(existing.response);
    }



    const body = createProgramSchema.parse(req.body);

    const program = await svc.createProgram(body);

    res.status(201).json({
      success: true,
      program,
    });

    // await prisma.idempotencyKey.update({
    //   where: {
    //     key_scope: { key, scope: "create_program" },
    //   },
    //   data: {
    //     response: result,
    //     statusCode: 201,
    //   },
    // });
  },
);

export const createCourseFromProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const { programId } = req.params as { programId: string };

    const payload = {
      ...req.body,
      pricings:
        typeof req.body.pricings === "string"
          ? JSON.parse(req.body.pricings)
          : req.body.pricings,
    };

    const course = await svc.createCourseFromProgramId({
      programId,
      payload,
      adminId: req.user!.id,
      file: req.file,
    });
    

    res.status(201).json({
      success: true,
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
  const program = await svc.getProgram(id as string);

  res.status(200).json({
    success: true,
    program,
  });
});

export const getProgramBySlugController = asyncHandler(
  async (req: Request, res: Response) => {
    const { slug } = req.params;

    const program = await svc.getProgramBySlug(slug as string);

    res.status(200).json({
      success: true,
      program,
    });
  },
);

export const updateProgramController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateProgramSchema.parse(req.body);

  const program = await svc.updateProgram(id as string, body);

  res.status(200).json({
    success: true,
    message: "Program updated successfully",
    program,
  });
});

export const deleteProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    await svc.deleteProgram(id as string);

    res.status(200).json({
      success: true,
      message: "Program deleted successfully",
    });
  },
);