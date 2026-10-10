/**
 * module.repository.ts
 *
 * Single point of contact with Prisma for the Module domain.
 * module.service.ts must never import prisma directly — this was violated
 * in the previous version of the service and is fixed by introducing this
 * repository, matching the Course/Program convention.
 */

import prisma from "../../lib/prisma";
import type { Prisma } from "@prisma/client";
import type { CreateModuleInput, UpdateModuleInput, ListModulesQuery } from "./module.schema";

// ─────────────────────────────────────────────────────────────────────────────
// SELECT SHAPES
// ─────────────────────────────────────────────────────────────────────────────

export const MODULE_LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  slug: true,
  courseId: true,
  position: true,
  totalDurationSeconds: true,
  views: true,
  completions: true,
  createdAt: true,
  updatedAt: true,
  topics: {
    where: { deletedAt: null },
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      title: true,
      slug: true,
      position: true,
      durationSeconds: true,
    },
  },
} satisfies Prisma.ModuleSelect;

export type ModuleWithTopics = Prisma.ModuleGetPayload<{
  select: typeof MODULE_LIST_SELECT;
}>;

// ─────────────────────────────────────────────────────────────────────────────
// COURSE OWNERSHIP / EXISTENCE PROBE
//
// Needed by the service to (a) confirm the parent course exists before
// creating a module under it, and (b) enforce instructor ownership — the
// previous service only checked existence, never ownership, which meant
// any authenticated instructor could create/edit/delete modules on ANY
// course, not just their own. Fixed at the service layer using this probe.
// ─────────────────────────────────────────────────────────────────────────────

export async function findCourseForModuleWrite(
  courseId: string,
): Promise<{ id: string; instructorId: string | null } | null> {
  return prisma.course.findUnique({
    where: { id: courseId, deletedAt: null },
    select: { id: true, instructorId: true },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLUG UNIQUENESS — scoped to courseId
//
// SCHEMA CHANGE: Module.slug is `@@unique([courseId, slug])`, not globally
// unique. The generic generateUniqueSlug() utility (used by Program/Course)
// assumes a single global uniqueness scope per entity type and has no way
// to express "unique within this courseId" — reusing it here would either
// under-constrain or over-constrain against the new schema. This is a real
// scoping bug, not a style choice, so slug generation is done locally
// against the correct scope instead.
// ─────────────────────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function generateUniqueModuleSlug(
  title: string,
  courseId: string,
  tx: Prisma.TransactionClient = prisma,
  excludeId?: string,
): Promise<string> {
  const base = slugify(title) || "module";
  let candidate = base;
  let suffix = 2;

  for (let attempts = 0; attempts < 50; attempts++) {
    const conflict = await tx.module.findFirst({
      where: {
        courseId,
        slug: candidate,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
      select: { id: true },
    });
    if (!conflict) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  throw new Error(`Could not generate a unique module slug for "${title}" after 50 attempts`);
}

// ─────────────────────────────────────────────────────────────────────────────
// POSITION — auto-append to end of course's module list
//
// The previous version had `position` commented out entirely on create,
// meaning every module silently landed at position 0 (the Prisma default).
// A course with 3+ modules would have all of them tied at position 0.
// Fixed by computing max(position)+1 within the course scope.
// ─────────────────────────────────────────────────────────────────────────────

export async function nextModulePosition(
  courseId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<number> {
  const aggregate = await tx.module.aggregate({
    where: { courseId, deletedAt: null },
    _max: { position: true },
  });
  return aggregate._max.position === null ? 0 : aggregate._max.position + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

export async function findModuleById(id: string): Promise<ModuleWithTopics | null> {
  return prisma.module.findUnique({
    where: { id, deletedAt: null },
    select: MODULE_LIST_SELECT,
  });
}

/** Existence probe for update/delete/ownership checks — cheap select, no nested topics. */
export async function findModuleForWrite(
  id: string,
): Promise<{ id: string; slug: string; courseId: string; title: string } | null> {
  return prisma.module.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true, courseId: true, title: true },
  });
}

export async function paginateModulesForCourse(
  courseId: string,
  query: ListModulesQuery,
): Promise<{ data: ModuleWithTopics[]; total: number }> {
  const where: Prisma.ModuleWhereInput = { courseId, deletedAt: null };

  const [total, data] = await prisma.$transaction([
    prisma.module.count({ where }),
    prisma.module.findMany({
      where,
      skip: query.offset,
      take: query.limit,
      orderBy: { position: "asc" },
      select: MODULE_LIST_SELECT,
    }),
  ]);

  return { data, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────────────────────

export async function insertModule(
  data: CreateModuleInput & { courseId: string },
  slug: string,
  position: number,
  tx: Prisma.TransactionClient = prisma,
): Promise<ModuleWithTopics> {
  return tx.module.create({
    data: {
      title: data.title,
      description: data.description,
      slug,
      courseId: data.courseId,
      position,
    },
    select: MODULE_LIST_SELECT,
  });
}

export async function updateModuleById(
  id: string,
  data: UpdateModuleInput & { slug?: string },
): Promise<ModuleWithTopics> {
  return prisma.module.update({
    where: { id },
    data,
    select: MODULE_LIST_SELECT,
  });
}

export async function softDeleteModule(id: string): Promise<void> {
  await prisma.module.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export async function incrementModuleViewCount(id: string): Promise<number> {
  const mod = await prisma.module.update({
    where: { id },
    data: { views: { increment: 1 } },
    select: { views: true },
  });
  return mod.views;
}

export async function incrementModuleCompletionCount(id: string): Promise<number> {
  const mod = await prisma.module.update({
    where: { id },
    data: { completions: { increment: 1 } },
    select: { completions: true },
  });
  return mod.completions;
}