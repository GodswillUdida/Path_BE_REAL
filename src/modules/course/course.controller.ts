/**
 * course.controller.ts
 *
 * HTTP adapter layer only. No business logic. No DB calls.
 * Responsibilities:
 *   - Parse and validate request inputs via Zod
 *   - Resolve actor identity from req.user (set by authGuard)
 *   - Delegate to the service layer
 *   - Shape the HTTP response
 *
 * If a controller exceeds ~25 lines, it's doing too much.
 */

import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { badRequest, unauthorized } from "../../utils/errors";
import * as svc from "./course.service";
import {
  createCourseSchema,
  updateCourseSchema,
  listCoursesQuerySchema,
} from "./course.schema";

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export const createCourseController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id: instructorId } = requireActor(req);
    const programId = req.params.programId as string | undefined;
    const data = createCourseSchema.parse(req.body);
    const { thumbnailFile, videoFile } = pickCourseFiles(req);

    const course = await svc.createCourse({
      data,
      instructorId,
      ...(programId ? { programId } : {}),
      thumbnailFile,
      videoFile,
    });

    return res.status(201).json({
      success: true,
      message: "Course created successfully",
      data: course,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────

export const listCoursesController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = listCoursesQuerySchema.parse(req.query);
    const result = await svc.listCourses(query);

    return res.json({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET BY ID
// ─────────────────────────────────────────────────────────────────────────────

export const getCourseController = asyncHandler(
  async (req: Request, res: Response) => {
    const course = await svc.getCourse(req.params.id as string);
    return res.json({ success: true, data: course });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET BY SLUG
// ─────────────────────────────────────────────────────────────────────────────

export const getCourseBySlugController = asyncHandler(
  async (req: Request, res: Response) => {
    const course = await svc.getCourseBySlug(req.params.courseSlug as string);
    return res.json({ success: true, data: course });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET BY SLUG AND PROGRAM
// ─────────────────────────────────────────────────────────────────────────────

export const getCourseBySlugAndProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const course = await svc.getCourseBySlugAndProgram(
      req.params.programSlug as string,
      req.params.courseSlug as string,
    );
    return res.json({ success: true, data: course });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export const updateCourseController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id: actorId, role: actorRole } = requireActor(req);
    const data = updateCourseSchema.parse(req.body);
    const { thumbnailFile, videoFile } = pickCourseFiles(req);

    const updated = await svc.updateCourse({
      id: req.params.id as string,
      actorId,
      actorRole,
      data,
      thumbnailFile,
      videoFile,
    });

    return res.json({
      success: true,
      message: "Course updated successfully",
      data: updated,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLISH / UNPUBLISH / ARCHIVE
// ─────────────────────────────────────────────────────────────────────────────

export const publishCourseController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id: actorId, role: actorRole } = requireActor(req);

    const updated = await svc.publishCourse({
      id: req.params.id as string,
      actorId,
      actorRole,
    });

    return res.json({
      success: true,
      message: "Course published successfully",
      data: updated,
    });
  },
);

export const unpublishCourseController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id: actorId, role: actorRole } = requireActor(req);

    const updated = await svc.unpublishCourse({
      id: req.params.id as string,
      actorId,
      actorRole,
    });

    return res.json({
      success: true,
      message: "Course unpublished successfully",
      data: updated,
    });
  },
);

export const archiveCourseController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id: actorId, role: actorRole } = requireActor(req);

    const updated = await svc.archiveCourse({
      id: req.params.id as string,
      actorId,
      actorRole,
    });

    return res.json({
      success: true,
      message: "Course archived successfully",
      data: updated,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export const deleteCourseController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id: actorId, role: actorRole } = requireActor(req);

    await svc.deleteCourse({
      id: req.params.id as string,
      actorId,
      actorRole,
    });

    return res.json({
      success: true,
      message: "Course deleted successfully",
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export const courseAnalyticsController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id: actorId, role: actorRole } = requireActor(req);

    const analytics = await svc.getCourseAnalytics(
      req.params.id as string,
      actorId,
      actorRole,
    );

    return res.json({ success: true, data: analytics });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function requireActor(req: Request): { id: string; role: string } {
  const user = req.user;
  if (!user?.id || !user?.role) {
    throw unauthorized("Authentication required");
  }
  return { id: user.id, role: user.role };
}

/**
 * Normalize multer `req.files` for course media fields.
 * Throws 400 on malformed upload structure or multiple files per field.
 */
function pickCourseFiles(req: Request): {
  thumbnailFile?: Express.Multer.File;
  videoFile?: Express.Multer.File;
} {
  // multer.fields() → object; multer.array() → array (unsupported here)
  if (req.files && Array.isArray(req.files)) {
    throw badRequest("Invalid file upload structure");
  }

  const files = req.files as
    | Record<string, Express.Multer.File[]>
    | undefined;

  if (files?.thumbnail && files.thumbnail.length > 1) {
    throw badRequest("Only one thumbnail file is allowed");
  }
  if (files?.videoPreview && files.videoPreview.length > 1) {
    throw badRequest("Only one video preview file is allowed");
  }

  return {
    thumbnailFile: files?.thumbnail?.[0],
    videoFile: files?.videoPreview?.[0],
  };
}