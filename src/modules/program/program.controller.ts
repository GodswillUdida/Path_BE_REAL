import { NextFunction, Request, Response } from "express";
import * as svc from "./program.service";
import { createProgramSchema } from "./program.schema";

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
  next: NextFunction
) => {
  try {
    const slug = req.params.slug;
    console.log("Fetching program with slug:", slug);

    const program = await svc.getProgramBySlug(slug);
    res.json({ success: true, program });
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
