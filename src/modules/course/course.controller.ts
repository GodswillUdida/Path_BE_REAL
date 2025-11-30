import { Request, Response } from "express";
import * as svc from "./course.service";
import { createCourseSchema, listCoursesQuery, updateCourseSchema } from "./course.schema";

export const createCourseController = async (req: Request, res: Response) => {
  const body = createCourseSchema.parse(req.body);
  const course = await svc.createCourse(body, req.user?.userId);
  res.status(201).json({ success: true, course });
};

export const listCoursesController = async (req: Request, res: Response) => {
  const query = listCoursesQuery.parse(req.query);
  const courses = await svc.listCourses(
    query.q,
    query.type as any,
    query.limit,
    query.offset
  );
  res.json({ success: true, courses });
};

export const getCourseController = async (req: Request, res: Response) => {
  // const id = req.params.id; 
  const course = await svc.getCourse(req.params.id);
  res.json({ success: true, course });
};

export const updateCourseController = async (req: Request, res: Response) => {
  const body = updateCourseSchema.parse(req.body);
  const updated = await svc.updateCourse(req.params.id, body);
  res.json({ success: true, updated });
};

export const deleteCourseController = async (req: Request, res: Response) => {
  await svc.deleteCourse(req.params.id);
  res.json({ success: true, message: "Deleted" });
};
