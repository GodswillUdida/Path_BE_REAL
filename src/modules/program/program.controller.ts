import { NextFunction, Request, Response } from "express";
import { createProgramSchema } from "./program.schema";
import z from "zod";
import * as svc from "./program.service";

export const createProgramController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const body = createProgramSchema.parse(req.body);
    const program = await svc.createProgram(body);
    res.status(201).json({ success: true, program });
  } catch (error) {
    next(error);
  }
};

export const listProgramsController = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const programs = await svc.listPrograms();
    res.json({
      success: true,
      count: programs.length,
      programs,
    });
  } catch (error) {
    next(error);
  }
};

export const getProgramController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id;
    const program = await svc.getProgram(id);
    res.json({ success: true, program });
  } catch (error) {
    next;
  }
};

export const getProgramBySlugController = async (
  req: Request,
  res: Response,
  next:NextFunction
) => {
  const slugSchema = z.object({
    slug: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[a-z0-9-]+$/i, "Invalid slug format"), // Security: Restrict to safe characters
  });
  try {
    const { slug } = slugSchema.parse(req.params)
    console.log("Validating Slug from params: ", slug);

    const program = await svc.getProgramBySlug(slug);

    if (!program) {
      return res.status(404).json({
        success: false,
        message: "Program not found",
      });
    }

    res.status(200).json({
      success: true,
      program
    });
    
  } catch (error) {
    next(error);
  }
};

export const updateProgramController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id;
    const body = req.body;
    const program = await svc.updateProgram(id, body);
    res.json({ success: true, program });
  } catch (error) {
    next(error);
  }
};

export const deleteProgramController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = req.params.id;
    await svc.deleteProgram(id);
    res.json({ success: true, message: "Program deleted" });
  } catch (error) {
    next(error);
  }
};
