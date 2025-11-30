import { Request, Response } from "express";
import * as svc from "./program.service";
import { createProgramSchema } from "./program.schema";

export const createProgramController = async (req: Request, res: Response) => {
  const body = createProgramSchema.parse(req.body);
  const program = await svc.createProgram(body);
  res.status(201).json({ success: true, program });
};

export const listProgramsController = async (_req: Request, res: Response) => {
  const programs = await svc.listPrograms();
  res.json({ success: true, programs });
};

export const getProgramController = async (req: Request, res: Response) => {
  const id = req.params.id;
  const program = await svc.getProgram(id);
  res.json({ success: true, program });
};
