/**
 * program.repository.ts
 *
 * Single source of truth for all Prisma access in the Program domain.
 * The service layer imports only this file — never prisma directly.
 *
 * Rules enforced here:
 *   - All reads filter deletedAt: null explicitly
 *   - select shapes are stable contracts (no include sprawl)
 *   - No `any` types — all inputs and outputs are strongly typed
 *   - Pagination enforced on collection queries
 */

import prisma from "../../lib/prisma";
import type { Prisma } from "@prisma/client";
import type { CreateProgramDTO, UpdateProgramDTO, ListProgramsQuery } from "./program.schema";

// ─────────────────────────────────────────────────────────────────────────────
// SELECT SHAPES
//
// PROGRAM_SUMMARY_SELECT — for list endpoints and foreign-key references.
//   Does not include courses (caller decides via separate query).
//
// PROGRAM_DETAIL_SELECT — for single-resource GET endpoints.
//   Includes a bounded course list (summaries only — no module tree).
//   Courses are paginated at the service layer; the select here defines
//   the per-course projection.
// ─────────────────────────────────────────────────────────────────────────────

export const PROGRAM_SUMMARY_SELECT = {
  id:          true,
  title:       true,
  slug:        true,
  image:       true,
  status:      true,
  createdAt:   true,
  _count: { select: { courses: true } },
} satisfies Prisma.ProgramSelect;

export const PROGRAM_DETAIL_SELECT = {
  id:          true,
  title:       true,
  slug:        true,
  description: true,
  image:       true,
  status:      true,
  createdAt:   true,
  updatedAt:   true,
  // Course list is bounded — detail page shows summary cards, not full trees.
  // Deep module/topic trees are fetched per-course on the course detail page.
  courses: {
    where:   { deletedAt: null },
    orderBy: { createdAt: "desc" as const },
    take:    20, // first page; further pages use the course list endpoint
    select: {
      id:        true,
      title:     true,
      slug:      true,
      thumbnail: true,
      level:     true,
      status:    true,
      duration:  true,
      pricings: {
        where:  { isActive: true },
        select: { id: true, name: true, price: true, currency: true },
        take:   1, // cheapest/primary pricing only on summary
      },
    },
  },
} satisfies Prisma.ProgramSelect;

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN TYPES — inferred from select shapes
// ─────────────────────────────────────────────────────────────────────────────

export type ProgramSummary = Prisma.ProgramGetPayload<{ select: typeof PROGRAM_SUMMARY_SELECT }>;
export type ProgramDetail  = Prisma.ProgramGetPayload<{ select: typeof PROGRAM_DETAIL_SELECT }>;

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

export async function findProgramById(id: string): Promise<ProgramDetail | null> {
  return prisma.program.findUnique({
    where:  { id, deletedAt: null },
    select: PROGRAM_DETAIL_SELECT,
  });
}

export async function findProgramBySlug(slug: string): Promise<ProgramDetail | null> {
  // Requires @@unique([slug]) in Prisma schema — enforced at DB level.
  return prisma.program.findUnique({
    where:  { slug, deletedAt: null },
    select: PROGRAM_DETAIL_SELECT,
  });
}

/**
 * Lightweight existence probe used for ownership / validation checks.
 * Returns only {id, slug} — avoids fetching full document when we just
 * need to assert the record exists before a write.
 */
export async function findProgramExists(
  id: string,
): Promise<{ id: string; slug: string } | null> {
  return prisma.program.findUnique({
    where:  { id, deletedAt: null },
    select: { id: true, slug: true },
  });
}

/**
 * Title uniqueness probe — used before create/update.
 * Excludes `excludeId` to allow a program to keep its own title on update.
 */
export async function findProgramByTitle(
  title:     string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  return prisma.program.findFirst({
    where: {
      title,
      deletedAt: null,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
    select: { id: true },
  });
}

export async function paginatePrograms(query: ListProgramsQuery): Promise<{
  data:  ProgramSummary[];
  total: number;
}> {
  const where: Prisma.ProgramWhereInput = {
    deletedAt: null,
    ...(query.status && { status: query.status }),
    ...(query.q && {
      OR: [
        { title:       { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
      ],
    }),
  };

  // Batched count + data in a single round-trip
  const [total, data] = await prisma.$transaction([
    prisma.program.count({ where }),
    prisma.program.findMany({
      where,
      skip:    query.offset,
      take:    query.limit,
      select:  PROGRAM_SUMMARY_SELECT,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { data, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────────────────────

export async function insertProgram(
  data:  CreateProgramDTO,
  slug:  string,
  tx:    Prisma.TransactionClient = prisma,
): Promise<ProgramDetail> {
  return tx.program.create({
    data: {
      title:       data.title,
      description: data.description,
      slug,
      image:       data.image ?? null,
      status:      data.status,
    },
    select: PROGRAM_DETAIL_SELECT,
  });
}

export async function updateProgramById(
  id:   string,
  data: Omit<Prisma.ProgramUpdateInput, "deletedAt">,
  tx:   Prisma.TransactionClient = prisma,
): Promise<ProgramDetail> {
  return tx.program.update({
    where:  { id },
    data,
    select: PROGRAM_DETAIL_SELECT,
  });
}

export async function softDeleteProgram(id: string): Promise<void> {
  await prisma.program.update({
    where: { id },
    data:  { deletedAt: new Date() },
  });
}