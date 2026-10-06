/**
 * program.service.ts
 *
 * Business logic and orchestration for Program.
 *
 * Rules:
 * - No Prisma.
 * - No Redis.
 * - DB through repository.
 * - Cache through cache module.
 * - Reads are cache-through.
 * - Writes invalidate and re-warm when appropriate.
 * - withMetrics wraps every public operation.
 * - Slug generation outside transactions.
 * - Course creation remains in course.service.
 */

import { badRequest, forbidden, notFound } from "../../utils/errors";

import { generateUniqueSlug } from "../../utils/slugify";

import { uploadImageOrFail, uploadThumbnail } from "../../utils/file";

import logger from "../../utils/logger";

import { withMetrics } from "../../utils/observability";

import * as repo from "./program.repository";
import * as cache from "./program.cache";

import type {
  CreateProgramDTO,
  UpdateProgramDTO,
  ListProgramsQuery,
  ReorderProgramCourseDTO,
} from "./program.schema";

import type { ProgramDetail, ProgramSummary } from "./program.repository";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ProgramActor = {
  id: string;
  role: string;
};

export type CreateProgramParams = {
  actor: ProgramActor;
  data: CreateProgramDTO;
  imageFile?: Express.Multer.File;
};

export type UpdateProgramParams = {
  id: string;
  actor: ProgramActor;
  data: UpdateProgramDTO;
  imageFile?: Express.Multer.File;
};

export type DeleteProgramParams = {
  id: string;
  actor: ProgramActor;
};

export type RestoreProgramParams = {
  id: string;
  actor: ProgramActor;
};

export type ReorderProgramCourseParams = {
  programId: string;
  actor: ProgramActor;
  data: ReorderProgramCourseDTO;
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export async function createProgram({
  actor,
  data,
  imageFile,
}: CreateProgramParams): Promise<ProgramDetail> {
  return withMetrics("program.create", async () => {
    enforceAdminOnly(actor, "create programs");

    const image = imageFile
      ? await uploadThumbnail(imageFile)
      : (data.image ?? null);

    const titleConflict = await repo.findProgramByTitle(data.title);

    if (titleConflict) {
      throw badRequest("A program with this title already exists");
    }

    const slug = await generateUniqueSlug(data.slug ?? data.title, "program");

    const program = await repo.insertProgram(
      {
        ...data,
        image: image ?? undefined,
      },
      slug,
    );

    await cache.setCachedProgram(program);

    await cache.invalidateProgram(program.id, undefined, program.slug);

    logger.info("program.created", {
      programId: program.id,
      actorId: actor.id,
    });

    return program;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────────────────────

export async function getProgram(id: string): Promise<ProgramDetail> {
  return withMetrics("program.get", async () => {
    const cached = await cache.getCachedProgramDetail(id);

    if (cached) {
      return cached;
    }

    const program = await repo.findProgramById(id);

    if (!program) {
      throw notFound("Program not found");
    }

    await cache.setCachedProgram(program);

    return program;
  });
}

export async function getProgramBySlug(slug: string): Promise<ProgramDetail> {
  return withMetrics("program.getBySlug", async () => {
    const cached = await cache.getCachedProgramBySlug(slug);

    if (cached) {
      return cached;
    }

    const program = await repo.findProgramBySlug(slug);

    if (!program) {
      throw notFound("Program not found");
    }

    await cache.setCachedProgram(program);

    return program;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────

export async function listPrograms(query: ListProgramsQuery): Promise<{
  data: ProgramSummary[];
  meta: ReturnType<typeof buildMeta>;
}> {
  return withMetrics("program.list", async () => {
    const cached = await cache.getCachedProgramList(query);

    if (cached) {
      return {
        data: cached.data,
        meta: buildMeta(query, cached.total),
      };
    }

    const result = await repo.paginatePrograms(query);

    await cache.setCachedProgramList(query, result);

    return {
      data: result.data,
      meta: buildMeta(query, result.total),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export async function updateProgram({
  id,
  actor,
  data,
  imageFile,
}: UpdateProgramParams): Promise<ProgramDetail> {
  return withMetrics("program.update", async () => {
    enforceAdminOnly(actor, "update programs");

    const existing = await repo.findProgramExists(id);

    if (!existing) {
      throw notFound("Program not found");
    }

    let image: string | null | undefined;

    if (imageFile) {
      image = await uploadImageOrFail(imageFile);
    } else if (data.image !== undefined) {
      image = data.image;
    }

    if (data.title !== undefined && data.title !== existing.title) {
      const conflict = await repo.findProgramByTitle(data.title, id);

      if (conflict) {
        throw badRequest("A program with this title already exists");
      }
    }

    let slug = existing.slug;

    if (data.slug !== undefined) {
      slug = await generateUniqueSlug(data.slug, "program", id);
    } else if (data.title !== undefined && data.title !== existing.title) {
      slug = await generateUniqueSlug(data.title, "program", id);
    }

    const { slug: _ignoredSlug, image: _ignoredImage, ...scalarUpdates } = data;

    const updated = await repo.updateProgramById(id, {
      ...scalarUpdates,
      slug,
      ...(image !== undefined ? { image } : {}),
    });

    await cache.invalidateProgram(id, existing.slug, updated.slug);

    await cache.setCachedProgram(updated);

    logger.info("program.updated", {
      programId: id,
      actorId: actor.id,
      slugChanged: existing.slug !== updated.slug,
    });

    return updated;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLISH
// ─────────────────────────────────────────────────────────────────────────────

export async function publishProgram({
  id,
  actor,
}: DeleteProgramParams): Promise<ProgramDetail> {
  return withMetrics("program.publish", async () => {
    enforceAdminOnly(actor, "publish programs");

    const existing = await repo.findProgramExists(id);

    if (!existing) {
      throw notFound("Program not found");
    }

    if (existing && (await repo.findProgramById(id))?.status === "PUBLISHED") {
      return getProgram(id);
    }

    // Keep actual publish-readiness rules here.
    // Add course/content validation as the LMS publish requirements
    // become explicit.
    const published = await repo.publishProgram(id);

    await cache.invalidateProgram(id, existing.slug, published.slug);

    await cache.setCachedProgram(published);

    logger.info("program.published", {
      programId: id,
      actorId: actor.id,
    });

    return published;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVE
// ─────────────────────────────────────────────────────────────────────────────

export async function archiveProgram({
  id,
  actor,
}: DeleteProgramParams): Promise<ProgramDetail> {
  return withMetrics("program.archive", async () => {
    enforceAdminOnly(actor, "archive programs");

    const existing = await repo.findProgramExists(id);

    if (!existing) {
      throw notFound("Program not found");
    }

    const archived = await repo.archiveProgram(id);

    await cache.invalidateProgram(id, existing.slug, archived.slug);

    await cache.setCachedProgram(archived);

    logger.info("program.archived", {
      programId: id,
      actorId: actor.id,
    });

    return archived;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteProgram({
  id,
  actor,
}: DeleteProgramParams): Promise<void> {
  return withMetrics("program.delete", async () => {
    enforceAdminOnly(actor, "delete programs");

    const existing = await repo.findProgramExists(id);

    if (!existing) {
      throw notFound("Program not found");
    }

    await repo.softDeleteProgram(id);

    await cache.invalidateProgram(id, existing.slug);

    logger.info("program.deleted", {
      programId: id,
      actorId: actor.id,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RESTORE
// ─────────────────────────────────────────────────────────────────────────────

export async function restoreProgram({
  id,
  actor,
}: RestoreProgramParams): Promise<ProgramDetail> {
  return withMetrics("program.restore", async () => {
    enforceAdminOnly(actor, "restore programs");

    const existing = await repo.findDeletedProgramById(id);

    if (!existing) {
      throw notFound("Deleted program not found");
    }

    const titleConflict = await repo.findActiveProgramByTitle(
      existing.title,
      id,
    );

    if (titleConflict) {
      throw badRequest("A program with this title already exists");
    }

    const slugConflict = await repo.findActiveProgramBySlug(existing.slug, id);

    if (slugConflict) {
      throw badRequest("A program with this slug already exists");
    }

    await cache.invalidateProgram(id, existing.slug);

    const restored = await repo.restoreProgram(id);

    await cache.setCachedProgram(restored);

    logger.info("program.restored", {
      programId: id,
      actorId: actor.id,
    });

    return restored;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REORDER
// ─────────────────────────────────────────────────────────────────────────────

export async function reorderProgramCourse({
  programId,
  actor,
  data,
}: ReorderProgramCourseParams): Promise<ProgramDetail> {
  return withMetrics("program.reorderCourse", async () => {
    enforceAdminOnly(actor, "reorder program courses");

    const program = await repo.findProgramExists(programId);

    if (!program) {
      throw notFound("Program not found");
    }

    const membership = await repo.findProgramCourse(programId, data.courseId);

    if (!membership) {
      throw notFound("Course is not assigned to this program");
    }

    await repo.reorderProgramCourse(programId, data.courseId, data.position);

    await cache.invalidateProgram(programId, program.slug);

    const updated = await repo.findProgramById(programId);

    if (!updated) {
      throw notFound("Program not found");
    }

    await cache.setCachedProgram(updated);

    logger.info("program.course_reordered", {
      programId,
      courseId: data.courseId,
      requestedPosition: data.position,
      actorId: actor.id,
    });

    return updated;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildMeta(query: ListProgramsQuery, total: number) {
  return {
    total,
    limit: query.limit,
    offset: query.offset,
    pages: query.limit > 0 ? Math.ceil(total / query.limit) : 0,
    hasMore: query.offset + query.limit < total,
  };
}

function enforceAdminOnly(actor: ProgramActor, action: string): void {
  const allowed = actor.role === "admin" || actor.role === "superadmin";

  if (!allowed) {
    throw forbidden(`Only admins may ${action}`);
  }
}
