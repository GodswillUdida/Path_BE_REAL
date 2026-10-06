/**
 * course.repository.ts
 *
 * Single point of contact with Prisma for the Course domain.
 * The service layer NEVER imports prisma directly — all DB
 * access flows through this repository.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SCHEMA-CHANGE NOTES (read before touching selects)
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Course.programId is GONE. Program linkage is exclusively through the
 *    ProgramCourse join table (Course.programs: ProgramCourse[]). Every
 *    place that used to do `program: { select: {...} } }` on Course now
 *    has to go through `programs: { select: { position: true, program: {
 *    select: {...} } } } }`.
 * 2. Course.duration is GONE. Course.totalDurationSeconds is a
 *    service-managed denormalized aggregate — selected read-only here,
 *    never written from insertCourse/updateCourseScalars input directly
 *    (the duration recompute service owns writes to this field).
 * 3. CoursePricing.durationDays (required) → accessDurationDays (nullable,
 *    null = lifetime). CoursePricing.isFree and .sortOrder are new fields.
 *    CoursePricing.price is Decimal(10,2) in Postgres now — Prisma returns
 *    this as a `Decimal` object, not a plain number; COURSE_LIST_SELECT/
 *    COURSE_DETAIL_SELECT consumers (controllers, cache serialization)
 *    must be aware CourseDetail.pricings[].price is `Prisma.Decimal`, not
 *    `number`. JSON.stringify() on a Decimal produces a string, which is
 *    fine for the API response but do NOT do arithmetic on it without
 *    `.toNumber()` first.
 * 4. Course.code is new — required, globally unique.
 * 5. Course.issuesCertificate is new.
 * ─────────────────────────────────────────────────────────────────────────
 */

import prisma from "../../lib/prisma";
import type { Prisma } from "@prisma/client";
import type {
  CreateCourseInput,
  UpdateCourseInput,
  CoursePricingInput,
  ListCoursesQuery,
} from "./course.schema";

// ─────────────────────────────────────────────────────────────────────────────
// SELECT SHAPES
// ─────────────────────────────────────────────────────────────────────────────

export const COURSE_LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  slug: true,
  code: true,
  thumbnail: true,
  level: true,
  status: true,
  tags: true,
  totalDurationSeconds: true,
  createdAt: true,
  instructorId: true,
  issuesCertificate: true,
  pricings: {
    where: { isActive: true },
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      name: true,
      price: true,
      currency: true,
      isFree: true,
      accessDurationDays: true,
    },
  },
  // Program linkage now goes through the join table. A course can belong
  // to zero or more programs (previously exactly zero-or-one via direct
  // FK) — list consumers get the ordered set of program summaries.
  programs: {
    orderBy: { position: "asc" as const },
    select: {
      position: true,
      program: { select: { id: true, title: true, slug: true } },
    },
  },
} satisfies Prisma.CourseSelect;

export const COURSE_DETAIL_SELECT = {
  id: true,
  title: true,
  slug: true,
  code: true,
  thumbnail: true,
  videoPreview: true,
  description: true,
  level: true,
  status: true,
  tags: true,
  totalDurationSeconds: true,
  issuesCertificate: true,
  createdAt: true,
  updatedAt: true,
  instructorId: true,
  pricings: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      name: true,
      price: true,
      currency: true,
      isFree: true,
      accessDurationDays: true,
      sortOrder: true,
      isActive: true,
    },
  },
  programs: {
    orderBy: { position: "asc" as const },
    select: {
      position: true,
      program: { select: { id: true, title: true, slug: true } },
    },
  },
  modules: {
    where: { deletedAt: null },
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      title: true,
      position: true,
      totalDurationSeconds: true,
      topics: {
        where: { deletedAt: null },
        orderBy: { position: "asc" as const },
        select: {
          id: true,
          title: true,
          position: true,
          durationSeconds: true,
        },
      },
    },
  },
} satisfies Prisma.CourseSelect;

export type CourseListItem = Prisma.CourseGetPayload<{
  select: typeof COURSE_LIST_SELECT;
}>;

export type CourseDetail = Prisma.CourseGetPayload<{
  select: typeof COURSE_DETAIL_SELECT;
}>;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildPricingCreateData(pricings: CoursePricingInput[]) {
  return pricings.map((p) => ({
    name: p.name ?? null,
    price: p.price,
    isFree: p.isFree,
    currency: p.currency,
    accessDurationDays: p.accessDurationDays, // null = lifetime, enforced at DB via partial unique index
    sortOrder: p.sortOrder,
    isActive: p.isActive,
  }));
}

function buildCourseWhereInput(
  query: ListCoursesQuery,
): Prisma.CourseWhereInput {
  const { q, tag, status, level, programId } = query;

  return {
    deletedAt: null,
    ...(status && { status }),
    ...(level && { level }),
    // Course.programId no longer exists — filter via the join table.
    // `some` because a course may now belong to multiple programs.
    ...(programId && { programs: { some: { programId } } }),
    ...(tag && { tags: { has: tag } }),
    ...(q && {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

export async function findCourseById(id: string): Promise<CourseDetail | null> {
  return prisma.course.findUnique({
    where: { id, deletedAt: null },
    select: COURSE_DETAIL_SELECT,
  });
}

export async function findCourseBySlugAndProgram(
  programSlug: string,
  courseSlug: string,
): Promise<CourseDetail | null> {
  return prisma.course.findFirst({
    where: {
      slug: courseSlug,
      deletedAt: null,
      programs: { some: { program: { slug: programSlug } } },
    },
    select: COURSE_DETAIL_SELECT,
  });
}

export async function findCourseBySlug(
  courseSlug: string,
): Promise<CourseDetail | null> {
  // Course.slug is now scoped uniquely per-course-globally still (per the
  // new schema: `slug String @unique` at the Course level — it did NOT
  // become program-scoped, only Module/Topic slugs became parent-scoped).
  // The programSlug segment is kept for URL/SEO purposes and as a filter
  // through the join table, but the actual lookup key is still the
  // globally-unique course slug.
  return prisma.course.findFirst({
    where: {
      slug: courseSlug,
      deletedAt: null,
    },
    select: COURSE_DETAIL_SELECT,
  });
}

export async function findCourseOwnership(
  id: string,
  instructorId: string,
): Promise<{ id: string } | null> {
  return prisma.course.findUnique({
    where: { id, instructorId, deletedAt: null },
    select: { id: true },
  });
}

export async function findCourseExists(
  id: string,
): Promise<{ id: string; slug: string; thumbnail: string | null } | null> {
  return prisma.course.findUnique({
    where: { id, deletedAt: null },
    select: { id: true, slug: true, thumbnail: true },
  });
}

/** New: code uniqueness probe, mirrors the existing slug-uniqueness pattern used in Program. */
export async function findCourseByCode(
  code: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  return prisma.course.findFirst({
    where: {
      code,
      deletedAt: null,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
    select: { id: true },
  });
}

export async function paginateCourses(query: ListCoursesQuery): Promise<{
  data: CourseListItem[];
  total: number;
}> {
  const where = buildCourseWhereInput(query);

  const [total, data] = await prisma.$transaction([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      skip: query.offset,
      take: query.limit,
      select: COURSE_LIST_SELECT,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { data, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE
//
// insertCourse signature changed: `programId` is accepted as a separate
// param (not part of CreateCourseInput — see course.schema.ts) so the
// caller (service) explicitly decides program linkage. When provided, the
// ProgramCourse row is created in the SAME nested write as the Course, so
// there is no window where the course exists without its program link if
// one was requested — and no separate transaction is needed for this case.
//
// `duration` param is REMOVED — totalDurationSeconds starts at the Prisma
// default (0) and is only ever updated by the duration recompute service.
// ─────────────────────────────────────────────────────────────────────────────

export async function insertCourse(
  data: CreateCourseInput,
  instructorId: string,
  slug: string,
  thumbnail: string,
  videoPreview: string | null,
  programId: string | undefined,
  tx: Prisma.TransactionClient,
): Promise<CourseDetail> {
  // No default `= prisma` here deliberately: this function now needs to run
  // the position aggregate + course create atomically when programId is
  // set, so callers MUST pass a real transaction client, not the bare
  // client. course.service.ts already does this (wraps in
  // prisma.$transaction). Removing the default is a compile-time guardrail
  // against a future caller accidentally calling this outside a tx.
  return tx.course.create({
    data: {
      title: data.title,
      code: data.code,
      description: data.description,
      slug,
      thumbnail,
      videoPreview,
      level: data.level,
      tags: data.tags,
      status: data.status,
      issuesCertificate: data.issuesCertificate,
      instructorId,
      pricings: { create: buildPricingCreateData(data.pricings) },
      ...(programId && {
        programs: {
          create: {
            programId,
            position: await nextProgramCoursePosition(programId, tx),
          },
        },
      }),
    },
    select: COURSE_DETAIL_SELECT,
  });
}

/**
 * FIXED: previously hardcoded position: 0 on every course-with-program
 * creation. ProgramCourse has `@@unique([programId, position])` — a second
 * course added to the same program would throw P2002 immediately. This
 * mirrors program.repository.ts's getNextProgramCoursePosition but is kept
 * local (not cross-imported) to avoid coupling the course repository to the
 * program repository for a two-line aggregate.
 */
async function nextProgramCoursePosition(
  programId: string,
  tx: Prisma.TransactionClient,
): Promise<number> {
  const aggregate = await tx.programCourse.aggregate({
    where: { programId },
    _max: { position: true },
  });
  return aggregate._max.position === null ? 0 : aggregate._max.position + 1;
}

export async function updateCourseScalars(
  id: string,
  data: Omit<Prisma.CourseUpdateInput, "pricings" | "programs" | "totalDurationSeconds">,
  tx: Prisma.TransactionClient = prisma,
): Promise<CourseDetail> {
  return tx.course.update({
    where: { id },
    data,
    select: COURSE_DETAIL_SELECT,
  });
}

export async function softDeleteCourse(id: string): Promise<void> {
  await prisma.course.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function publishCourse(
  id: string,
): Promise<CourseDetail> {
  return prisma.course.update({
    where: {
      id,
    },
    data: {
      status: "PUBLISHED",
    },
    select: COURSE_DETAIL_SELECT,
  });
}

export async function archiveCourse(
  id: string,
): Promise<CourseDetail> {
  return prisma.course.update({
    where: {
      id,
    },
    data: {
      status: "ARCHIVED",
    },
    select: COURSE_DETAIL_SELECT,
  });
}

export async function unpublishCourse(
  id: string,
): Promise<CourseDetail> {
  return prisma.course.update({
    where: {
      id,
    },
    data: {
      status: "DRAFT",
    },
    select: COURSE_DETAIL_SELECT,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING UPSERT
//
// Strategy unchanged: upsert by id, deactivate removed tiers, never
// hard-delete (OrderItem/Enrollment reference pricing rows by FK with
// onDelete: Restrict — a hard delete would be rejected by Postgres anyway
// once any order exists against that tier).
//
// NOTE: the DB-level partial unique indexes documented on CoursePricing
// (one active lifetime offer per course, one active offer per distinct
// accessDurationDays per course) are NOT enforced by Prisma's type system.
// A concurrent upsert that violates them will throw P2002 — the service
// layer must catch and translate that into a 409, same as the Program
// title-uniqueness race.
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertCoursePricings(
  courseId: string,
  pricings: CoursePricingInput[],
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  const incomingIds = pricings
    .filter((p): p is CoursePricingInput & { id: string } => !!p.id)
    .map((p) => p.id);

  await tx.coursePricing.updateMany({
    where: { courseId, id: { notIn: incomingIds } },
    data: { isActive: false },
  });

  for (const pricing of pricings) {
    if (pricing.id) {
      await tx.coursePricing.update({
        where: { id: pricing.id },
        data: {
          name: pricing.name ?? null,
          price: pricing.price,
          isFree: pricing.isFree,
          currency: pricing.currency,
          accessDurationDays: pricing.accessDurationDays,
          sortOrder: pricing.sortOrder,
          isActive: pricing.isActive,
        },
      });
    } else {
      await tx.coursePricing.create({
        data: {
          courseId,
          name: pricing.name ?? null,
          price: pricing.price,
          isFree: pricing.isFree,
          currency: pricing.currency,
          accessDurationDays: pricing.accessDurationDays,
          sortOrder: pricing.sortOrder,
          isActive: pricing.isActive,
        },
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRAM LINKAGE (new — replaces the old direct programId FK write)
// ─────────────────────────────────────────────────────────────────────────────

export async function linkCourseToProgram(
  courseId: string,
  programId: string,
  position: number,
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  // @@unique([programId, courseId]) on ProgramCourse makes this idempotent
  // against double-linking; @@unique([programId, position]) means the
  // caller is responsible for passing a non-conflicting position.
  await tx.programCourse.create({
    data: { courseId, programId, position },
  });
}

export async function unlinkCourseFromProgram(
  courseId: string,
  programId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  await tx.programCourse.delete({
    where: { programId_courseId: { programId, courseId } },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
//
// FIXED: the previous version aggregated via `orderItem.coursePricing` —
// OrderItem's relation to CoursePricing is named `pricing` in the schema
// (`pricing CoursePricing @relation(fields: [pricingId], ...)`), not
// `coursePricing`. This was a silent bug: Prisma would have thrown at
// runtime (unknown relation field), not at compile time, if `coursePricing`
// isn't a valid nested-where key — confirm this compiles clean now.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchCourseAnalytics(courseId: string): Promise<{
  totalEnrollments: number;
  activePricings: number;
  totalRevenue: number;
}> {
  const [enrollments, pricings, revenue] = await prisma.$transaction([
    prisma.enrollment.count({ where: { courseId } }),
    prisma.coursePricing.count({ where: { courseId, isActive: true } }),
    prisma.orderItem.aggregate({
      _sum: { unitPrice: true },
      where: {
        pricing: { courseId },
        order: { status: "PAID" },
      },
    }),
  ]);

  return {
    totalEnrollments: enrollments,
    activePricings: pricings,
    totalRevenue: revenue._sum.unitPrice ? Number(revenue._sum.unitPrice) : 0,
  };
}

export async function verifyProgramExists(
  programId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<boolean> {
  const program = await tx.program.findUnique({
    where: { id: programId },
    select: { id: true },
  });
  return program !== null;
}