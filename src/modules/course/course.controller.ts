import { NextFunction, Request, Response } from "express";
import * as svc from "./course.service";
import {
  createCourseSchema,
  listCoursesQuery,
  updateCourseSchema,
} from "./course.schema";
import { badRequest } from "../../utils/errors";

export const createOnlineCourseController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { programSlug } = req.params;
    const body = createCourseSchema.parse({
      ...req.body,
      type: "online",
      pricings: req.body.pricings ? JSON.parse(req.body.pricings) : undefined,
    });

    if (body.type !== "online") {
      throw badRequest("Invalid course type for online endpoint");
    }

    const course = await svc.createOnlineCourse(
      programSlug,
      body,
      req.user!.id,
      req.file?.buffer,
      req.file?.mimetype
    );

    res.status(201).json({
      success: true,
      course,
    });
  } catch (error) {
    next(error);
  }
};

export const createPhysicalCourseController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { programSlug } = req.params;
    const body = createCourseSchema.parse({ ...req.body, type: "physical" });

    if (body.type !== "physical") {
      throw badRequest("Invalid course type for physical endpoint");
    }

    const course = await svc.createPhysicalCourse(
      programSlug,
      body,
      req.user.id,
      req.file?.buffer,
      req.file?.mimetype
    );

    res.status(201).json({ success: true, course });
  } catch (error) {
    next(error);
  }
};

export const listCoursesController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const query = listCoursesQuery.parse(req.query);
    const courses = await svc.listCourses(
      query.q,
      query.type,
      query.limit,
      query.offset
    );
    res.json({ success: true, courses });
  } catch (error) {
    next(error);
  }
};

export const getCourseController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const course = await svc.getCourse(req.params.id);
    res.json({ success: true, course });
  } catch (error) {
    next(error);
  }
};

export const getCourseBySlugController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const course = await svc.getCourseBySlug(
      req.params.programSlug,
      req.params.courseSlug
    );
    res.json({ success: true, course });
  } catch (error) {
    next(error);
  }
};

export const updateCourseController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const body = updateCourseSchema.parse(req.body);
    const updated = await svc.updateCourse(
      req.params.id,
      body,
      req.file?.buffer,
      req.file?.mimetype
    );
    res.json({ success: true, updated });
  } catch (error) {
    next(error);
  }
};

export const deleteCourseController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await svc.deleteCourse(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    next(error);
  }
};
