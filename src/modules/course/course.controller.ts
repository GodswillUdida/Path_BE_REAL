import { Request, Response, NextFunction } from "express";
import * as svc from "./course.service";
import {
  createCourseSchema,
  listCoursesQuery,
  updateCourseSchema,
} from "./course.schema";
import { badRequest, notFound } from "../../utils/errors";
import { asyncHandler } from "../../utils/asyncHandler";

//* -------------------- CREATE COURSE -------------------- */
export const createCourseController = asyncHandler(
  async (req: Request, res: Response) => {

    const instructorId = req.user?.id;
    if (!instructorId) throw badRequest("Unauthorized");

    const programId = req.params.programId;
    if (!programId) throw badRequest("programId is required");

    const parsedBody = {
      ...req.body,
      programId,
      pricings:
        typeof req.body.pricings === "string"
          ? JSON.parse(req.body.pricings)
          : req.body.pricings,
    };

    const parsed = createCourseSchema.parse(parsedBody);

    const course = await svc.createCourse({
      data: parsed,
      instructorId,
      file: req.file,
    });

    return res.status(201).json({
      success: true,
      message: "Course created successfully",
      data: course,
    });
  },
);

/* -------------------- LIST COURSES -------------------- */
export const listCoursesController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = listCoursesQuery.parse(req.query);

    const result = await svc.listCourses(
      query.q,
      query.tag,
      // undefined,
      query.limit,
      query.offset,
    );

    return res.json({
      success: true,
      ...result,
    });
  },
);

/* -------------------- GET COURSE BY ID -------------------- */
export const getCourseController = asyncHandler(
  async (req: Request, res: Response) => {
    const course = await svc.getCourse(req.params.id as string);

    return res.json({
      success: true,
      data: course,
    });
  },
);

/* -------------------- GET COURSE BY SLUG -------------------- */
export const getCourseBySlugController = asyncHandler(
  async (req: Request, res: Response) => {
    const { programSlug, courseSlug } = req.params;

    const course = await svc.getCourseBySlug(
      programSlug as string,
      courseSlug as string,
    );

    return res.json({
      success: true,
      data: course,
    });
  },
);

/* -------------------- UPDATE COURSE -------------------- */
export const updateCourseController = asyncHandler(
  async (req: Request, res: Response) => {
    let pricings = req.body.pricings;

    if (typeof pricings === "string") {
      try {
        pricings = JSON.parse(pricings);
      } catch {
        throw badRequest("Invalid pricings format");
      }
    }

    const parsed = updateCourseSchema.parse({
      ...req.body,
      pricings,
    });

    const updated = await svc.updateCourse(
      req.params.id as string,
      parsed,
      req.file?.buffer,
      req.file?.mimetype,
    );

    return res.json({
      success: true,
      message: "Course updated successfully",
      data: updated,
    });
  },
);

//* -------------------- COURSE ANALYTICS -------------------- */
export const courseAnalyticsController = asyncHandler(
  async (req: Request, res: Response) => {
    const analytics = await svc.getCourseAnalytics(req.params.id as string);

    return res.json({
      success: true,
      data: analytics,
    });
  },
);

/* -------------------- DELETE COURSE -------------------- */
export const deleteCourseController = asyncHandler(
  async (req: Request, res: Response) => {
    await svc.deleteCourse(req.params.id as string);

    return res.json({
      success: true,
      message: "Course deleted successfully",
    });
  },
);
