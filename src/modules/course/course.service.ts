/**
 * course.service.ts
 *
 * Pure business logic layer. No Prisma imports — all DB access
 * goes through course.repository.ts. No Redis imports — all cache
 * access goes through course.cache.ts.
 *
 * This layer owns:
 *   - Orchestration (upload → slug → DB transaction)
 *   - Ownership / authorization checks
 *   - Cache-through reads and write-through invalidation
 *   - Observability (metrics wrapping on hot paths)
 */

import prisma from "../../lib/prisma";
import { badRequest, forbidden, notFound } from "../../utils/errors";
import { generateUniqueSlug } from "../../utils/slugify";
import { uploadThumbnail, uploadVideoPreview } from "../../utils/file";
import logger from "../../utils/logger";
import { withMetrics } from "../../utils/observability";

import * as repo from "./course.repository";
// import * as cache from "./course.cache";

import type { CreateCourseInput, UpdateCourseInput, ListCoursesQuery } from "./course.schema";
import type { CourseDetail } from "./course.repository";
import type { AnalyticsPayload } from "./course.cache";

// ─────────────────────────────────────────────────────────────────────────────
// PARAM TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CreateCourseParams = {
  data: CreateCourseInput;
  instructorId: string;
  thumbnailFile?: Express.Multer.File;
  videoFile?: Express.Multer.File;
};

export type UpdateCourseParams = {
  id: string;
  actorId: string;   // authenticated user performing the update
  actorRole: string;   // "instructor" | "admin" | "superadmin"
  data: UpdateCourseInput;
  thumbnailFile?: Express.Multer.File;
  videoFile?: Express.Multer.File;
};

export type DeleteCourseParams = {
  id: string;
  actorId: string;
  actorRole: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
//
// Order of operations:
//   1. Upload media (outside tx — failed uploads must not open a transaction)
//   2. Generate slug (outside tx — may hit DB for uniqueness check)
//   3. Open transaction: validate program → insert course + pricings
//   4. Invalidate cache (after successful commit)
// ─────────────────────────────────────────────────────────────────────────────

// export async function createCourse({
//   data,
//   instructorId,
//   thumbnailFile,
//   videoFile,
// }: CreateCourseParams): Promise<CourseDetail> {
//   return withMetrics("course.create", async () => {
//     // ── 1. Resolve media ────────────────────────────────────────────────────
//     // const thumbnail = thumbnailFile
//     //   ? await uploadImageOrFail(thumbnailFile)
//     //   : data.thumbnail;

//     // if (!thumbnail) {
//     //   throw badRequest("A thumbnail is required — upload a file or provide a CDN URL");
//     // }

//     // const videoPreview = videoFile
//     //   ? await uploadVideoOrFail(videoFile)
//     //   : (data.videoPreview ?? null);

//     // 🔥 Upload in parallel (faster + independent)
//     const [thumbnail, video] = await Promise.all([
//       safeUpload(thumbnailFile, { folder: "courses/images" }),
//       safeUpload(videoFile, { folder: "courses/videos" }),
//     ]);


//     // ── 2. Slug (before tx to keep the transaction short) ───────────────────
//     const slug = await generateUniqueSlug(data.slug ?? data.title, "course");

//     // ── 3. DB transaction ───────────────────────────────────────────────────
//     const course = await prisma.$transaction(async (tx) => {
//       if (data.programId) {
//         const exists = await repo.verifyProgramExists(data.programId, tx);
//         if (!exists) throw notFound("Program not found");
//       }

//       return repo.insertCourse(data, instructorId, slug, thumbnail, video, tx);
//     });

//     // ── 4. Warm cache after commit ───────────────────────────────────────────
//     await cache.setCachedCourseDetail(course);

//     logger.info("course.created", { courseId: course.id, instructorId });
//     return course;
//   });
// }

export async function createCourse({
  data,
  instructorId,
  thumbnailFile,
  videoFile,
}: CreateCourseParams): Promise<CourseDetail> {
  return withMetrics("course.create", async () => {
 
    // ── 1. Resolve thumbnail (REQUIRED) ─────────────────────────────────────
    //
    // Priority: uploaded file > URL from payload > fail with 400.
    //
    // uploadThumbnail() throws:
    //   - 400 (BadRequest)  on validation failure (wrong MIME, size exceeded)
    //   - 503 (ApiError)    on CDN failure after retries
    //
    // Both are caught by the global error middleware and returned as clean
    // JSON responses — neither reaches the DB.
    //
    let thumbnail: string;
 
    if (thumbnailFile) {
      thumbnail = await uploadThumbnail(thumbnailFile);
    } else if (data.thumbnail) {
      thumbnail = data.thumbnail;
    } else {
      throw badRequest("A thumbnail is required. Upload a file or provide a CDN URL.");
    }
 
    // ── 2. Resolve videoPreview (OPTIONAL) ──────────────────────────────────
    //
    // uploadVideoPreview() returns null on CDN failure — non-fatal.
    // The course is created without a video preview rather than failing.
    // Instructors can add the video later via PATCH.
    //
    const videoPreview: string | null = videoFile
      ? await uploadVideoPreview(videoFile)
      : (data.videoPreview ?? null);
 
    // ── 3. Slug — outside transaction ───────────────────────────────────────
    const slug = await generateUniqueSlug(data.slug ?? data.title, "course");
 
    // ── 4. Narrow transaction: verify program + insert course ────────────────
    const course = await prisma.$transaction(async (tx) => {
      if (data.programId) {
        const programExists = await repo.verifyProgramExists(data.programId, tx);
        if (!programExists) throw notFound("Program not found");
      }
 
      return repo.insertCourse(data, instructorId, slug, thumbnail, videoPreview, tx);
    });
 
    // ── 5. Warm cache after commit ───────────────────────────────────────────
    // await cache.setCachedCourseDetail(course);
 
    logger.info("course.created", { courseId: course.id, instructorId });
    return course;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET BY ID — cache-through
// ─────────────────────────────────────────────────────────────────────────────

export async function getCourse(courseId: string): Promise<CourseDetail> {
  return withMetrics("course.get", async () => {
    // const cached = await cache.getCachedCourseDetail(courseId);
    // if (cached) return cached;

    const course = await repo.findCourseById(courseId);
    if (!course) throw notFound("Course not found");

    // await cache.setCachedCourseDetail(course);
    return course;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET BY SLUG — cache-through (hottest public path)
// ─────────────────────────────────────────────────────────────────────────────

export async function getCourseBySlug(
  programSlug: string,
  courseSlug: string,
): Promise<CourseDetail> {
  return withMetrics("course.getBySlug", async () => {
    // const cached = await cache.getCachedCourseBySlug(courseSlug);
    // if (cached) return cached;

    const course = await repo.findCourseBySlug(programSlug, courseSlug);
    if (!course) throw notFound("Course not found");

    // await cache.setCachedCourseDetail(course);
    return course;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST — cache-through
// ─────────────────────────────────────────────────────────────────────────────

export async function listCourses(query: ListCoursesQuery) {
  return withMetrics("course.list", async () => {
    // const cached = await cache.getCachedCourseList(query);
    // if (cached) {
    //   return {
    //     data: cached.data,
    //     meta: buildMeta(query, cached.total),
    //   };
    // }

    const { data, total } = await repo.paginateCourses(query);

    // await cache.setCachedCourseList(query, { data, total });

    return {
      data,
      meta: buildMeta(query, total),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
//
// Ownership check: instructors can only update their own courses.
// Admins and superadmins bypass the ownership check.
// ─────────────────────────────────────────────────────────────────────────────

export async function updateCourse({
  id,
  actorId,
  actorRole,
  data,
  thumbnailFile,
  videoFile,
}: UpdateCourseParams): Promise<CourseDetail> {
  return withMetrics("course.update", async () => {
    // ── Ownership / existence check ─────────────────────────────────────────
    const existing = await repo.findCourseExists(id);
    if (!existing) throw notFound("Course not found");

    const isPrivileged = actorRole === "admin" || actorRole === "superadmin";
    if (!isPrivileged) {
      const owned = await repo.findCourseOwnership(id, actorId);
      if (!owned) throw forbidden("You do not have permission to update this course");
    }

    // ── Resolve media ────────────────────────────────────────────────────────
    let thumbnail = existing.thumbnail;
    if (thumbnailFile) thumbnail = await uploadThumbnail(thumbnailFile);
    else if (data.thumbnail) thumbnail = data.thumbnail;

    let videoPreview: string | null | undefined = undefined; // undefined = no-op in Prisma update
    if (videoFile) videoPreview = await uploadVideoPreview(videoFile);
    else if (data.videoPreview !== undefined) videoPreview = data.videoPreview;

    // ── Slug ─────────────────────────────────────────────────────────────────
    let slug = existing.slug;
    if (data.slug) slug = await generateUniqueSlug(data.slug, "course", id);
    else if (data.title) slug = await generateUniqueSlug(data.title, "course", id);

    // ── Separate scalar fields from relational ────────────────────────────────
    const { pricings, thumbnail: _t, videoPreview: _vp, slug: _s, ...scalarUpdates } = data;

    // ── Transaction: pricing upsert + course scalar update ───────────────────
    const updated = await prisma.$transaction(async (tx) => {
      if (pricings?.length) {
        await repo.upsertCoursePricings(id, pricings, tx);
      }

      return repo.updateCourseScalars(
        id,
        {
          ...scalarUpdates,
          slug,
          thumbnail,
          ...(videoPreview !== undefined && { videoPreview }),
        },
        tx,
      );
    });

    // ── Invalidate stale cache ────────────────────────────────────────────────
    // await cache.invalidateCourse(id, existing.slug);
    // Warm with fresh data immediately
    // await cache.setCachedCourseDetail(updated);

    logger.info("course.updated", { courseId: id, actorId });
    return updated;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SOFT DELETE
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteCourse({
  id,
  actorId,
  actorRole,
}: DeleteCourseParams): Promise<void> {
  const existing = await repo.findCourseExists(id);
  if (!existing) throw notFound("Course not found");

  const isPrivileged = actorRole === "admin" || actorRole === "superadmin";
  if (!isPrivileged) {
    const owned = await repo.findCourseOwnership(id, actorId);
    if (!owned) throw forbidden("You do not have permission to delete this course");
  }

  await repo.softDeleteCourse(id);
  // await cache.invalidateCourse(id, existing.slug);

  logger.info("course.deleted", { courseId: id, actorId });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS — cache-through
//
// Existence is inferred: if the course doesn't exist, all counts are 0.
// We validate existence separately only to give a clean 404.
// ─────────────────────────────────────────────────────────────────────────────

export async function getCourseAnalytics(
  courseId: string,
  actorId: string,
  actorRole: string,
): Promise<AnalyticsPayload> {
  // AnalyticsPayload
  return withMetrics("course.analytics", async () => {
    const existing = await repo.findCourseExists(courseId);
    if (!existing) throw notFound("Course not found");

    const isPrivileged = actorRole === "admin" || actorRole === "superadmin";
    if (!isPrivileged) {
      const owned = await repo.findCourseOwnership(courseId, actorId);
      if (!owned) throw forbidden("You do not have permission to view this course's analytics");
    }

    // const cached = await cache.getCachedAnalytics(courseId);
    // if (cached) return cached;

    const raw = await repo.fetchCourseAnalytics(courseId);
    const payload = { courseId, ...raw };

    // await cache.setCachedAnalytics(payload);
    return payload;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildMeta(query: ListCoursesQuery, total: number) {
  return {
    total,
    limit: query.limit,
    offset: query.offset,
    pages: Math.ceil(total / query.limit),
    hasMore: query.offset + query.limit < total,
  };
}