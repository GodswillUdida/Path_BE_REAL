/**
 * course.service.ts
 *
 * Pure business logic layer. No Prisma imports for queries — all DB access
 * goes through course.repository.ts. Prisma error TYPES are imported for
 * constraint-violation translation only (see handleWriteConstraints below);
 * this does not violate the "no Prisma imports" rule for query access,
 * it's error-shape recognition, same category as importing an error class.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SCHEMA-CHANGE NOTES
 * ─────────────────────────────────────────────────────────────────────────
 * 1. `programId` is REMOVED from CreateCourseInput (course.schema.ts) —
 *    Course has no programId column anymore. It now arrives as an explicit
 *    `programId?: string` param on CreateCourseParams, populated by the
 *    controller from the route param, and passed separately into
 *    repo.insertCourse (which creates the ProgramCourse row in the same
 *    nested write). Previously this flowed through `data.programId` inside
 *    the parsed body — that field silently no longer exists post-parse
 *    with the new schema (Zod strips unrecognized keys by default), so
 *    leaving it wired through `data` would have been a SILENT breakage:
 *    no error, program linkage just stops happening. Caught and fixed here.
 * 2. `code` is a new required, globally-unique Course field. Added the same
 *    two-layer uniqueness pattern used for Program.title (app-level probe
 *    for a clean error message + DB constraint as the race-condition
 *    backstop, translated via P2002 below).
 * 3. New P2002 sources to translate into clean 4xx responses:
 *      - Course.code unique constraint
 *      - CoursePricing partial unique indexes (one active lifetime offer
 *        per course; one active offer per distinct accessDurationDays per
 *        course) — these are raw-SQL indexes not expressible in the
 *        Prisma schema, so Prisma has no compile-time knowledge of them;
 *        a violation surfaces only as a runtime P2002 with no field name
 *        Prisma can attribute automatically. handleWriteConstraints below
 *        gives a generic-but-honest message rather than mQuoting the raw
 *        Postgres index name to the client.
 * ─────────────────────────────────────────────────────────────────────────
 */

import fs from "fs/promises";
import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import { badRequest, forbidden, notFound, unprocessable } from "../../utils/errors";
import { generateUniqueSlug } from "../../utils/slugify";
import { uploadThumbnail, uploadVideoPreview } from "../../utils/file";
import logger from "../../utils/logger";
import { withMetrics } from "../../utils/observability";

import * as repo from "./course.repository";
import * as cache from "./course.cache";

import type {
  CreateCourseInput,
  UpdateCourseInput,
  ListCoursesQuery,
} from "./course.schema";
import type { CourseDetail } from "./course.repository";
import type { AnalyticsPayload } from "./course.cache";
import { enqueueCourseVideoProcessing } from "./course.queue";

// ─────────────────────────────────────────────────────────────────────────────
// PARAM TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CreateCourseParams = {
  data: CreateCourseInput;
  instructorId: string;
  // NEW: explicit, separate from `data` — see schema-change note #1 above.
  // Optional because standalone course creation (no program) is valid.
  programId?: string;
  thumbnailFile?: Express.Multer.File;
  videoFile?: Express.Multer.File;
};

export type UpdateCourseParams = {
  id: string;
  actorId: string;
  actorRole: string;
  data: UpdateCourseInput;
  thumbnailFile?: Express.Multer.File;
  videoFile?: Express.Multer.File;
};

export type DeleteCourseParams = {
  id: string;
  actorId: string;
  actorRole: string;
};

type Role = "student" | "instructor" | "admin" | "superadmin";
type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

type StatusTransitionParams = {
  id: string;
  actorId: string;
  actorRole: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRAINT TRANSLATION
//
// Translates Postgres/Prisma unique-constraint violations that can occur
// during the create/update transaction into clean, honest 400s instead of
// letting a raw P2002 bubble to the global error middleware as a 500.
//
// meta.target on a P2002 is either an array of Prisma-known column names
// (for constraints Prisma's schema knows about, e.g. Course.code) or
// absent/unreliable for the raw-SQL partial unique indexes on
// CoursePricing, since those exist only in the migration, not the Prisma
// schema. Both branches are handled explicitly rather than assuming
// meta.target is always populated.
// ─────────────────────────────────────────────────────────────────────────────

function handleWriteConstraints(err: unknown): never {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    const target = (err.meta?.target as string[] | string | undefined) ?? [];
    const targetStr = Array.isArray(target) ? target.join(",") : String(target);

    if (targetStr.includes("code")) {
      throw badRequest("A course with this code already exists");
    }
    if (targetStr.includes("course_pricing_one_lifetime_per_course")) {
      throw badRequest(
        "This course already has an active lifetime pricing offer",
      );
    }
    if (targetStr.includes("course_pricing_one_active_duration_per_course")) {
      throw badRequest(
        "This course already has an active offer for that access duration",
      );
    }
    // Fallback: still a uniqueness violation, still a 400, just not one we
    // have a friendlier message for — do not leak the raw constraint name.
    throw badRequest("This change conflicts with an existing record");
  }
  throw err;
}

async function transitionCourseStatus(params: {
  id: string;
  actorId: string;
  actorRole: string;
  target: CourseStatus;
  action: string;
  metric: string;
  mutate: (id: string) => Promise<CourseDetail>;
  assertReady?: (course: CourseDetail) => void;
}): Promise<CourseDetail> {
  const { id, actorId, actorRole, target, action, metric, mutate, assertReady } =
    params;

  return withMetrics(metric, async () => {
    const existing = await repo.findCourseById(id);
    if (!existing) throw notFound("Course not found");

    await assertCanManageCourse(id, actorId, actorRole, action);

    // Idempotent: no write, no cache churn
    if (existing.status === target) {
      return existing;
    }

    assertReady?.(existing);

    const updated = await mutate(id);

    await Promise.all([
      cache.invalidateCourse(id, existing.slug),
      cache.setCachedCourseDetail(updated),
    ]);

    logger.info(`course.${action}`, {
      courseId: id,
      actorId,
      from: existing.status,
      to: target,
    });

    return updated;
  });
}

async function assertCanManageCourse(
  id: string,
  actorId: string,
  actorRole: string,
  action: string,
) {
  const isPrivileged = actorRole === "admin" || actorRole === "superadmin";
  if (isPrivileged) return;

  const owned = await repo.findCourseOwnership(id, actorId);
  if (!owned) {
    throw forbidden(`You do not have permission to ${action} this course`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export async function createCourse({
  data,
  instructorId,
  programId,
  thumbnailFile,
  videoFile,
}: CreateCourseParams): Promise<CourseDetail> {
  return withMetrics("course.create", async () => {
    // ── 1. Thumbnail (REQUIRED, synchronous — uploadThumbnail retries internally) ──
    let thumbnail: string;
    if (thumbnailFile) {
      thumbnail = await uploadThumbnail(thumbnailFile);
    } else if (data.thumbnail) {
      thumbnail = data.thumbnail;
    } else {
      throw badRequest(
        "A thumbnail is required — upload a file or provide a CDN URL",
      );
    }

    // ── 2. Code uniqueness — app-level check for a clean error message ──────
    const codeConflict = await repo.findCourseByCode(data.code);
    if (codeConflict)
      throw badRequest("A course with this code already exists");

    // ── 3. Slug — outside transaction ────────────────────────────────────────
    const slug = await generateUniqueSlug(data.slug ?? data.title, "course");

    // ── 4. Insert course (+ ProgramCourse link, if programId given) ─────────
    //
    // CRITICAL: always call repo.insertCourse with a REAL transaction
    // client as the final argument. Its `tx` parameter has no default
    // (deliberate compile-time guardrail) — calling it with tx missing or
    // undefined means the nested `programs: { create: {...} } }` write
    // and the position aggregate never run atomically, which is exactly
    // how a course can end up created without its ProgramCourse link.
    // program-existence check, next-position aggregate, and the course
    // insert all run against the SAME tx so they're atomic against
    // concurrent course creations in the same program.
    let course: CourseDetail;
    try {
      course = await prisma.$transaction(async (tx) => {
        if (programId) {
          const programExists = await repo.verifyProgramExists(programId, tx);
          if (!programExists) throw notFound("Program not found");
        }
        return repo.insertCourse(
          data,
          instructorId,
          slug,
          thumbnail,
          null, // videoPreview resolved after commit — needs course.id, see step 5
          programId,
          tx,
        );
      });
    } catch (err) {
      handleWriteConstraints(err);
    }

    // ── 5. Enqueue video preview AFTER commit — keeps the response fast ─────
    //
    // Video upload never blocks course creation: thumbnail is required and
    // small (≤5MB, uploaded synchronously above), but the preview clip can
    // be up to 100MB — offloading it to courseVideoPreviewQueue is what
    // keeps this endpoint fast regardless of clip size. The worker
    // (course.worker.ts) picks up the job, uploads via
    // uploadVideoPreviewFromPath, and patches videoPreview onto the course
    // row once done.
    //
    // IMPORTANT: this only actually populates videoPreview if
    // courseVideoPreviewWorker is running somewhere and consuming
    // QUEUE_NAMES.COURSE_VIDEO_PREVIEW. If no worker process is started,
    // the job sits in Redis forever and videoPreview stays null — silently,
    // with no error surfaced here or to the client. Confirm the worker is
    // wired into your process startup before relying on this path.
    if (videoFile) {
      try {
        await enqueueCourseVideoProcessing({
          courseId: course.id,
          filePath: videoFile.path,
          originalFilename: videoFile.originalname,
        });
      } catch (err) {
        logger.error("Failed to enqueue course video preview processing", {
          courseId: course.id,
          error: err instanceof Error ? err.message : String(err),
        });
        await fs.unlink(videoFile.path).catch(() => {});
        // Non-fatal — video preview is optional, course creation still succeeds.
      }
    }

    logger.info("course.created", {
      courseId: course.id,
      instructorId,
      programId,
      linkedToProgram: !!programId,
      videoPreviewQueued: !!videoFile,
    });
    return course;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET BY ID — cache-through
// ─────────────────────────────────────────────────────────────────────────────

export async function getCourse(courseId: string): Promise<CourseDetail> {
  return withMetrics("course.get", async () => {
    const cached = await cache.getCachedCourseDetail(courseId);
    if (cached) return cached;

    const course = await repo.findCourseById(courseId);
    if (!course) throw notFound("Course not found");

    await cache.setCachedCourseDetail(course);
    return course;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET BY SLUG — cache-through (hottest public path)
// ─────────────────────────────────────────────────────────────────────────────

export async function getCourseBySlug(
  courseSlug: string,
): Promise<CourseDetail> {
  return withMetrics("course.getBySlug", async () => {
    const cached = await cache.getCachedCourseBySlug(courseSlug);
    if (cached) return cached;

    const course = await repo.findCourseBySlug(courseSlug);
    if (!course) throw notFound("Course not found");

    await cache.setCachedCourseDetail(course);
    return course;
  });
}

export async function getCourseBySlugAndProgram(
  programSlug: string,
  courseSlug: string,
): Promise<CourseDetail> {
  return withMetrics("course.getBySlugAndProgram", async () => {
    const cached = await cache.getCachedCourseBySlug(courseSlug);
    if (cached) {
      // Cache hit — verify program linkage (see note below)
      const linkedToProgram = cached.programs.some(
        (p) => p.program.slug === programSlug,
      );
      if (linkedToProgram) return cached;
    }

    const course = await repo.findCourseBySlugAndProgram(
      programSlug,
      courseSlug,
    );
    if (!course) throw notFound("Course not found");

    await cache.setCachedCourseDetail(course);
    return course;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST — cache-through
// ─────────────────────────────────────────────────────────────────────────────

export async function listCourses(query: ListCoursesQuery) {
  return withMetrics("course.list", async () => {
    const cached = await cache.getCachedCourseList(query);
    if (cached) {
      return { data: cached.data, meta: buildMeta(query, cached.total) };
    }

    const { data, total } = await repo.paginateCourses(query);
    await cache.setCachedCourseList(query, { data, total });

    return { data, meta: buildMeta(query, total) };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
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
    // ── Ownership / existence check ──────────────────────────────────────────
    const existing = await repo.findCourseExists(id);
    if (!existing) throw notFound("Course not found");

    await assertCanManageCourse(id, actorId, actorRole, "update");

    // ── Code uniqueness (only if changing it) ────────────────────────────────
    if (data.code) {
      const conflict = await repo.findCourseByCode(data.code, id);
      if (conflict) throw badRequest("A course with this code already exists");
    }

    // ── Resolve media ─────────────────────────────────────────────────────────
    let thumbnail = existing.thumbnail;
    if (thumbnailFile) thumbnail = await uploadThumbnail(thumbnailFile);
    else if (data.thumbnail) thumbnail = data.thumbnail;

    // FIXED: previously `await uploadVideoPreview(videoFile)` here — a
    // synchronous, blocking CDN upload of a video file inside the request
    // cycle. createCourse already treats this exact upload as async (queued
    // via courseVideoPreviewQueue); this path was silently doing the
    // opposite for updates, in direct violation of the project's "async by
    // default" rule for long-running operations (video uploads, email
    // notifications — never block the request cycle). Fixed to enqueue the
    // same way createCourse does. videoPreview scalar is left untouched
    // (undefined = no-op in the Prisma update) — the queue worker writes
    // the resulting CDN URL once the upload completes, same as on create.
    let videoPreview: string | null | undefined = undefined;
    if (!videoFile && data.videoPreview !== undefined)
      videoPreview = data.videoPreview;

    // ── Slug ──────────────────────────────────────────────────────────────────
    let slug = existing.slug;
    if (data.slug) slug = await generateUniqueSlug(data.slug, "course", id);
    else if (data.title)
      slug = await generateUniqueSlug(data.title, "course", id);

    // ── Separate scalar fields from relational ─────────────────────────────────
    const {
      pricings,
      thumbnail: _t,
      videoPreview: _vp,
      slug: _s,
      ...scalarUpdates
    } = data;

    // ── Transaction: pricing upsert + course scalar update ────────────────────
    let updated: CourseDetail;
    try {
      updated = await prisma.$transaction(async (tx) => {
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
    } catch (err) {
      handleWriteConstraints(err);
    }

    // ── Invalidate stale cache ───────────────────────────────────────────────
    await cache.invalidateCourse(id, existing.slug);
    await cache.setCachedCourseDetail(updated);

    // ── Enqueue video preview AFTER commit (see fix note above) ─────────────
    if (videoFile) {
      try {
        await enqueueCourseVideoProcessing({
          courseId: id,
          filePath: videoFile.path,
          originalFilename: videoFile.originalname,
        });
      } catch (err) {
        logger.error(
          "Failed to enqueue course video preview processing on update",
          {
            courseId: id,
            error: err instanceof Error ? err.message : String(err),
          },
        );
        await fs.unlink(videoFile.path).catch(() => {});
        // Non-fatal — matches createCourse's treatment of preview as
        // best-effort/optional.
      }
    }

    logger.info("course.updated", { courseId: id, actorId });
    return updated;
  });
}

export async function publishCourse({
  id,
  actorId,
  actorRole,
}: StatusTransitionParams): Promise<CourseDetail> {
  return transitionCourseStatus({
    id,
    actorId,
    actorRole,
    target: "PUBLISHED",
    action: "publish",
    metric: "course.publish",
    mutate: repo.publishCourse,
    assertReady: (course) => {
      if (!course.modules?.length) {
        throw unprocessable("Add at least one module before publishing");
      }
    },
  });
}

export async function unpublishCourse({
  id,
  actorId,
  actorRole,
}: StatusTransitionParams): Promise<CourseDetail> {
  return transitionCourseStatus({
    id,
    actorId,
    actorRole,
    target: "DRAFT",
    action: "unpublish",
    metric: "course.unpublish",
    mutate: repo.unpublishCourse,
  });
}

export async function archiveCourse({
  id,
  actorId,
  actorRole,
}: StatusTransitionParams): Promise<CourseDetail> {
  return transitionCourseStatus({
    id,
    actorId,
    actorRole,
    target: "ARCHIVED",
    action: "archive",
    metric: "course.archive",
    mutate: repo.archiveCourse,
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
  return withMetrics("course.delete", async () => {
    const existing = await repo.findCourseExists(id);
    if (!existing) throw notFound("Course not found");

    await assertCanManageCourse(id, actorId, actorRole, "delete");

    await repo.softDeleteCourse(id);
    await cache.invalidateCourse(id, existing.slug);

    logger.info("course.deleted", { courseId: id, actorId });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS — cache-through
// ─────────────────────────────────────────────────────────────────────────────

export async function getCourseAnalytics(
  courseId: string,
  actorId: string,
  actorRole: string,
): Promise<AnalyticsPayload> {
  return withMetrics("course.analytics", async () => {
    const existing = await repo.findCourseExists(courseId);
    if (!existing) throw notFound("Course not found");

    await assertCanManageCourse(courseId, actorId, actorRole, "view analytics for");

    const cached = await cache.getCachedAnalytics(courseId);
    if (cached) return cached;

    const raw = await repo.fetchCourseAnalytics(courseId);
    const payload = { courseId, ...raw };

    await cache.setCachedAnalytics(payload);
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
