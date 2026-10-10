import type { Request, Response } from "express";

import { asyncHandler } from "../../utils/asyncHandler";

import { badRequest, unauthorized } from "../../utils/errors";

import {
  createProgramSchema,
  updateProgramSchema,
  listProgramsQuerySchema,
  reorderProgramCourseSchema,
} from "./program.schema";

import * as svc from "./program.service";

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export const createProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = requireActor(req);

    const data = createProgramSchema.parse(req.body);

    const program = await svc.createProgram({
      actor,
      data,
      imageFile: req.file,
    });

    return res.status(201).json({
      success: true,
      message: "Program created successfully",
      data: program,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────

export const listProgramsController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = listProgramsQuerySchema.parse(req.query);

    const result = await svc.listPrograms(query);

    return res.json({
      success: true,
      message: "Programs listed successfully",
      ...result,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET BY ID
// ─────────────────────────────────────────────────────────────────────────────

export const getProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const program = await svc.getProgram(requireParam(req.params.id as string, "id"));

    return res.json({
      success: true,
      message: "Program retrieved successfully",
      data: program,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET BY SLUG
// ─────────────────────────────────────────────────────────────────────────────

export const getProgramBySlugController = asyncHandler(
  async (req: Request, res: Response) => {
    const program = await svc.getProgramBySlug(
      requireParam(req.params.slug as string, "slug"),
    );

    return res.json({
      success: true,
      message: "Program retrieved successfully",
      data: program,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export const updateProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = requireActor(req);

    const data = updateProgramSchema.parse(req.body);

    const program = await svc.updateProgram({
      id: requireParam(req.params.id as string, "id"),
      actor,
      data,
      imageFile: req.file,
    });

    return res.json({
      success: true,
      message: "Program updated successfully",
      data: program,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLISH
// ─────────────────────────────────────────────────────────────────────────────

export const publishProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = requireActor(req);

    const program = await svc.publishProgram({
      id: requireParam(req.params.id as string, "id"),
      actor,
    });

    return res.json({
      success: true,
      message: "Program published successfully",
      data: program,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVE
// ─────────────────────────────────────────────────────────────────────────────

export const archiveProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = requireActor(req);

    const program = await svc.archiveProgram({
      id: requireParam(req.params.id as string, "id"),
      actor,
    });

    return res.json({
      success: true,
      message: "Program archived successfully",
      data: program,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export const deleteProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = requireActor(req);

    await svc.deleteProgram({
      id: requireParam(req.params.id as string, "id"),
      actor,
    });

    return res.json({
      success: true,
      message: "Program deleted successfully",
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// RESTORE
// ─────────────────────────────────────────────────────────────────────────────

export const restoreProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = requireActor(req);

    const program = await svc.restoreProgram({
      id: requireParam(req.params.id as string, "id"),
      actor,
    });

    return res.json({
      success: true,
      message: "Program restored successfully",
      data: program,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// REORDER
// ─────────────────────────────────────────────────────────────────────────────

export const reorderProgramCourseController = asyncHandler(
  async (req: Request, res: Response) => {
    const actor = requireActor(req);

    const data = reorderProgramCourseSchema.parse(req.body);

    const program = await svc.reorderProgramCourse({
      programId: requireParam(req.params.id as string, "id"),
      actor,
      data,
    });

    return res.json({
      success: true,
      message: "Program course order updated successfully",
      data: program,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function requireActor(req: Request): {
  id: string;
  role: string;
} {
  const user = req.user;

  if (!user?.id || !user?.role) {
    throw unauthorized("Authentication required");
  }

  return {
    id: user.id,
    role: user.role,
  };
}

function requireParam(value: string | undefined, name: string): string {
  if (!value) {
    throw badRequest(`${name} parameter is required`);
  }

  return value;
}
