/**
 * module.service.ts
 *
 * Business logic and orchestration for Module.
 * No Prisma imports — all DB access via module.repository.
 */

import prisma from "../../lib/prisma";
import { badRequest, forbidden, notFound } from "../../utils/errors";
import { withMetrics } from "../../utils/observability";

import * as repo from "./module.repo";
import * as cache from "./module.cache";

import type { CreateModuleInput, ListModulesQuery, UpdateModuleInput } from "./module.schema";
import type { ModuleWithTopics } from "./module.repo";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ModuleActor = { id: string; role: string };

export type CreateModuleParams = CreateModuleInput & {
  courseId: string;
  actor: ModuleActor;
};

export type UpdateModuleParams = {
  id: string;
  actor: ModuleActor;
  data: UpdateModuleInput;
};

export type DeleteModuleParams = {
  id: string;
  actor: ModuleActor;
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORIZATION
//
// Previously missing entirely: the old service only checked that the
// course exists, never that the acting instructor owns it. Any
// authenticated instructor could create/update/delete modules on any
// course. Enforced here, mirroring course.service.ts's ownership pattern
// (admin/superadmin bypass, instructor must own the parent course).
// ─────────────────────────────────────────────────────────────────────────────

function enforceCourseWriteAccess(
  actor: ModuleActor,
  course: { instructorId: string | null },
): void {
  const isPrivileged = actor.role === "admin" || actor.role === "superadmin";
  if (isPrivileged) return;
  if (course.instructorId !== actor.id) {
    throw forbidden("You do not have permission to modify modules on this course");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export async function createModule(params: CreateModuleParams): Promise<ModuleWithTopics> {
  return withMetrics("module.create", async () => {
    const { courseId, actor, ...data } = params;

    const course = await repo.findCourseForModuleWrite(courseId);
    if (!course) throw notFound("Course not found");

    enforceCourseWriteAccess(actor, course);

    const created = await prisma.$transaction(async (tx) => {
      const slug = await repo.generateUniqueModuleSlug(data.title, courseId, tx);

      // Client-supplied position is honored if given (e.g. inserting at a
      // specific spot in an existing curriculum); otherwise the module is
      // appended to the end. The previous version silently dropped
      // position entirely — every module landed at 0.
      const position = data.position ?? (await repo.nextModulePosition(courseId, tx));

      return repo.insertModule({ ...data, courseId }, slug, position, tx);
    });

    await cache.invalidateModuleList(courseId);
    return created;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST — cache-through
// ─────────────────────────────────────────────────────────────────────────────

export async function listModulesForCourse(
  courseId: string,
  query: ListModulesQuery,
): Promise<{ data: ModuleWithTopics[]; meta: ReturnType<typeof buildMeta> }> {
  return withMetrics("module.list", async () => {
    const cached = await cache.getCachedModuleList(courseId, query);
    if (cached) {
      return { data: cached.data, meta: buildMeta(query, cached.total) };
    }

    const { data, total } = await repo.paginateModulesForCourse(courseId, query);
    await cache.setCachedModuleList(courseId, query, { data, total });

    return { data, meta: buildMeta(query, total) };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export async function updateModule(params: UpdateModuleParams): Promise<ModuleWithTopics> {
  return withMetrics("module.update", async () => {
    const { id, actor, data } = params;

    const existing = await repo.findModuleForWrite(id);
    if (!existing) throw notFound("Module not found");

    const course = await repo.findCourseForModuleWrite(existing.courseId);
    if (!course) throw notFound("Course not found");
    enforceCourseWriteAccess(actor, course);

    let slug: string | undefined;
    if (data.title && data.title !== existing.title) {
      slug = await repo.generateUniqueModuleSlug(data.title, existing.courseId, prisma, id);
    }

    const updated = await repo.updateModuleById(id, { ...data, ...(slug && { slug }) });
    await cache.invalidateModuleList(existing.courseId);
    return updated;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteModule(params: DeleteModuleParams): Promise<void> {
  return withMetrics("module.delete", async () => {
    const { id, actor } = params;

    const existing = await repo.findModuleForWrite(id);
    if (!existing) throw notFound("Module not found");

    const course = await repo.findCourseForModuleWrite(existing.courseId);
    if (!course) throw notFound("Course not found");
    enforceCourseWriteAccess(actor, course);

    await repo.softDeleteModule(id);
    await cache.invalidateModuleList(existing.courseId);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export async function incrementModuleView(id: string): Promise<number> {
  return repo.incrementModuleViewCount(id);
}

export async function incrementModuleCompletion(id: string): Promise<number> {
  return repo.incrementModuleCompletionCount(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildMeta(query: ListModulesQuery, total: number) {
  return {
    total,
    limit: query.limit,
    offset: query.offset,
    pages: Math.ceil(total / query.limit),
    hasMore: query.offset + query.limit < total,
  };
}