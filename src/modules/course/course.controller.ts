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
import { unauthorized } from "../../utils/errors";
import * as svc from "./course.service";
import {
  createCourseSchema,
  updateCourseSchema,
  listCoursesQuerySchema,
} from "./course.schema";
import { MulterFiles } from "@/types/express";



// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

// export const createCourseController = asyncHandler(async (req: Request, res: Response) => {
//   const { id: instructorId } = requireActor(req);

//   // const files = req.files as Partial<MulterFiles>;
//   const files = (req.files ?? {}) as Partial<MulterFiles>;

//   console.log(typeof req.body.pricings, req.body.pricings);


//   if (typeof req.body.pricings === "string") {
//     try {
//       req.body.pricings = JSON.parse(req.body.pricings);
//     } catch (e) {
//       req.body.pricings = [];
//     }
//   }


//   // pricings already parsed from multipart JSON by parseJsonFields middleware
//   const parsed = createCourseSchema.parse({
//     ...req.body,
//     programId: req.params.programId,
//   });

//   const course = await svc.createCourse({
//     data: parsed,
//     instructorId,
//     thumbnailFile: files.thumbnail?.[0],
//     videoFile: files.videoPreview?.[0],
//     // thumbnailUrl: parsed.thumbnailUrl ?? null,
//     // videoPreviewUrl: parsed.videoPreviewUrl ?? null,
//   });

//   return res.status(201).json({ success: true, message: "Course created successfully", data: course });
// });

export const createCourseController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id: instructorId } = requireActor(req);

    const parsed = createCourseSchema.parse({
      ...req.body,
      programId: req.params.programId,
    });
 
    const course = await svc.createCourse({
      data:          parsed,
      instructorId,
      thumbnailFile: (req.files as Record<string, Express.Multer.File[]>)?.thumbnail?.[0],
      videoFile:     (req.files as Record<string, Express.Multer.File[]>)?.videoPreview?.[0],
    });
 
    return res.status(201).json({
      success: true,
      message: "Course created successfully",
      data:    course,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────

export const listCoursesController = asyncHandler(async (req: Request, res: Response) => {
  const query = listCoursesQuerySchema.parse(req.query);
  const result = await svc.listCourses(query);
  return res.json({ success: true, ...result });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET BY ID
// ─────────────────────────────────────────────────────────────────────────────

export const getCourseController = asyncHandler(async (req: Request, res: Response) => {
  const course = await svc.getCourse(req.params.id as string);
  return res.json({ success: true, data: course });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET BY SLUG
// ─────────────────────────────────────────────────────────────────────────────

export const getCourseBySlugController = asyncHandler(async (req: Request, res: Response) => {
  const { programSlug, courseSlug } = req.params;
  const course = await svc.getCourseBySlug(programSlug as string, courseSlug as string);
  return res.json({ success: true, data: course });
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export const updateCourseController = asyncHandler(async (req: Request, res: Response) => {
  const { id: actorId, role: actorRole } = requireActor(req);

  if (!req.files || Array.isArray(req.files)) {
    throw new Error("Invalid file upload structure");
  }

  const files = req.files as MulterFiles;

  const parsed = updateCourseSchema.parse(req.body);

  const updated = await svc.updateCourse({
    id: req.params.id as string,
    actorId,
    actorRole,
    data: parsed,
    thumbnailFile: files.thumbnail?.[0],
    videoFile: files.videoPreview?.[0],
  });

  return res.json({ success: true, message: "Course updated successfully", data: updated });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export const deleteCourseController = asyncHandler(async (req: Request, res: Response) => {
  const { id: actorId, role: actorRole } = requireActor(req);

  await svc.deleteCourse({ id: req.params.id as string, actorId, actorRole });
  return res.json({ success: true, message: "Course deleted successfully" });
});

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export const courseAnalyticsController = asyncHandler(async (req: Request, res: Response) => {
  const { id: actorId, role: actorRole } = requireActor(req);

  const analytics = await svc.getCourseAnalytics(req.params.id as string, actorId, actorRole);
  return res.json({ success: true, data: analytics });
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Asserts req.user is populated (authGuard must run before this).
 * Throws 401 if not. Centralised so every controller doesn't repeat the check.
 */
function requireActor(req: Request): { id: string; role: string } {
  const user = req.user;
  if (!user?.id || !user?.role) throw unauthorized("Authentication required");
  return { id: user.id, role: user.role };
}