/**
 * course.repository.ts
 *
 * Single point of contact with Prisma for the Course domain.
 * The service layer NEVER imports prisma directly — all DB
 * access flows through this repository.
 *
 * Benefits:
 *   - Swappable DB implementation (test doubles, alternative ORMs)
 *   - Centralised select shapes and query contracts
 *   - Service layer stays pure business logic
 */

import prisma from "../../lib/prisma";
import type { Prisma } from "@prisma/client";
import type { CreateCourseInput, UpdateCourseInput, CoursePricingInput, ListCoursesQuery } from "./course.schema";

// ─────────────────────────────────────────────────────────────────────────────
// SELECT SHAPES
//
// Each shape is a stable contract. COURSE_LIST_SELECT intentionally omits
// description, modules, and inactive pricings — list endpoints must stay lean.
// COURSE_DETAIL_SELECT is defined independently (no spread) so both shapes
// are explicit, auditable, and can diverge safely.
// ─────────────────────────────────────────────────────────────────────────────

export const COURSE_LIST_SELECT = {
  id:           true,
  title:        true,
  slug:         true,
  thumbnail:    true,
  level:        true,
  status:       true,
  tags:         true,
  duration:     true,
  createdAt:    true,
  instructorId: true,
  pricings: {
    where:  { isActive: true },
    select: { id: true, name: true, price: true, currency: true, durationDays: true },
  },
  program: { select: { id: true, title: true, slug: true } },
} satisfies Prisma.CourseSelect;

export const COURSE_DETAIL_SELECT = {
  id:           true,
  title:        true,
  slug:         true,
  thumbnail:    true,
  videoPreview: true,
  description:  true,
  level:        true,
  status:       true,
  tags:         true,
  duration:     true,
  createdAt:    true,
  updatedAt:    true,
  instructorId: true,
  pricings: {
    select: { id: true, name: true, price: true, currency: true, durationDays: true, isActive: true },
  },
  program: { select: { id: true, title: true, slug: true } },
  modules: {
    where:   { deletedAt: null },
    orderBy: { position: "asc" as const },
    select: {
      id:       true,
      title:    true,
      position: true,
      topics: {
        where:   { deletedAt: null },
        orderBy: { position: "asc" as const },
        select:  { id: true, title: true, position: true, durationSeconds: true },
      },
    },
  },
} satisfies Prisma.CourseSelect;

// Return types inferred from select shapes — service works with these, not Prisma models
export type CourseListItem   = Prisma.CourseGetPayload<{ select: typeof COURSE_LIST_SELECT }>;
export type CourseDetail     = Prisma.CourseGetPayload<{ select: typeof COURSE_DETAIL_SELECT }>;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildPricingCreateData(pricings: CoursePricingInput[]) {
  return pricings.map((p) => ({
    name:         p.name ?? null,
    price:        p.price,
    currency:     p.currency,
    durationDays: p.durationDays,
    isActive:     p.isActive,
  }));
}

function buildCourseWhereInput(query: ListCoursesQuery): Prisma.CourseWhereInput {
  const { q, tag, status, level, programId } = query;

  return {
    deletedAt: null,
    ...(status    && { status }),
    ...(level     && { level }),
    ...(programId && { programId }),
    ...(tag       && { tags: { has: tag } }),
    // Full-text search — requires a GIN trigram index on (title, description).
    // See: CREATE INDEX CONCURRENTLY idx_course_search ON "Course"
    //      USING gin(to_tsvector('english', title || ' ' || description));
    ...(q && {
      OR: [
        { title:       { contains: q, mode: "insensitive" } },
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
    where:  { id, deletedAt: null },
    select: COURSE_DETAIL_SELECT,
  });
}

export async function findCourseBySlug(
  programSlug: string,
  courseSlug:  string,
): Promise<CourseDetail | null> {
  // Single query via nested where — avoids the extra round-trip of fetching
  // the program first, then the course.
  return prisma.course.findFirst({
    where:  { slug: courseSlug, deletedAt: null, program: { slug: programSlug } },
    select: COURSE_DETAIL_SELECT,
  });
}

export async function findCourseOwnership(
  id:           string,
  instructorId: string,
): Promise<{ id: string } | null> {
  return prisma.course.findUnique({
    where:  { id, instructorId, deletedAt: null },
    select: { id: true },
  });
}

export async function findCourseExists(id: string): Promise<{ id: string; slug: string; thumbnail: string | null } | null> {
  return prisma.course.findUnique({
    where:  { id, deletedAt: null },
    select: { id: true, slug: true, thumbnail: true },
  });
}

export async function paginateCourses(query: ListCoursesQuery): Promise<{
  data:  CourseListItem[];
  total: number;
}> {
  const where = buildCourseWhereInput(query);

  const [total, data] = await prisma.$transaction([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      skip:    query.offset,
      take:    query.limit,
      select:  COURSE_LIST_SELECT,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { data, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────────────────────

export async function insertCourse(
  data:         CreateCourseInput,
  instructorId: string,
  slug:         string,
  thumbnail:    string,
  videoPreview: string | null,
  tx:           Prisma.TransactionClient = prisma,
): Promise<CourseDetail> {
  return tx.course.create({
    data: {
      title:        data.title,
      description:  data.description,
      slug,
      thumbnail,
      videoPreview,
      level:        data.level ?? null,
      tags:         data.tags,
      duration:     data.duration ?? null,
      status:       data.status,
      programId:    data.programId ?? null,
      instructorId,
      pricings:     { create: buildPricingCreateData(data.pricings) },
    },
    select: COURSE_DETAIL_SELECT,
  });
}

export async function updateCourseScalars(
  id:           string,
  data:         Omit<Prisma.CourseUpdateInput, "pricings">,
  tx:           Prisma.TransactionClient = prisma,
): Promise<CourseDetail> {
  return tx.course.update({
    where:  { id },
    data,
    select: COURSE_DETAIL_SELECT,
  });
}

export async function softDeleteCourse(id: string): Promise<void> {
  await prisma.course.update({
    where: { id },
    data:  { deletedAt: new Date() },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING UPSERT
//
// Strategy: upsert by id (preserve history), deactivate removed tiers.
// We NEVER hard-delete pricing rows — completed orders reference them.
// Batching: updateMany for the deactivation pass, then individual
// upserts. In practice pricing arrays are ≤ 10 items so this is fine.
// If this ever reaches hundreds of tiers, migrate to createMany + raw upsert.
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertCoursePricings(
  courseId: string,
  pricings: CoursePricingInput[],
  tx:       Prisma.TransactionClient = prisma,
): Promise<void> {
  const incomingIds = pricings
    .filter((p): p is CoursePricingInput & { id: string } => !!p.id)
    .map((p) => p.id);

  // Deactivate tiers not in the incoming payload
  await tx.coursePricing.updateMany({
    where: { courseId, id: { notIn: incomingIds } },
    data:  { isActive: false },
  });

  for (const pricing of pricings) {
    if (pricing.id) {
      await tx.coursePricing.update({
        where: { id: pricing.id },
        data: {
          name:         pricing.name ?? null,
          price:        pricing.price,
          currency:     pricing.currency,
          durationDays: pricing.durationDays,
          isActive:     pricing.isActive,
        },
      });
    } else {
      await tx.coursePricing.create({
        data: {
          courseId,
          name:         pricing.name ?? null,
          price:        pricing.price,
          currency:     pricing.currency,
          durationDays: pricing.durationDays,
          isActive:     pricing.isActive,
        },
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
//
// All three aggregations in one $transaction — single round-trip.
// Revenue is scoped by coursePricing.courseId AND order.status = COMPLETED.
// The existence check is merged: if enrollment count returns 0 and course
// doesn't exist we catch it at the service level via findCourseExists.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchCourseAnalytics(courseId: string): Promise<{
  totalEnrollments: number;
  activePricings:   number;
  totalRevenue:     number;
}> {
  const [enrollments, pricings, revenue] = await prisma.$transaction([
    prisma.enrollment.count({ where: { courseId } }),
    prisma.coursePricing.count({ where: { courseId, isActive: true } }),
    prisma.orderItem.aggregate({
      _sum:  { unitPrice: true },
      where: {
        coursePricing: { courseId },
        order:         { status: "PAID" },
      },
    }),
  ]);

  return {
    totalEnrollments: enrollments,
    activePricings:   pricings,
    totalRevenue:     revenue._sum.unitPrice ?? 0,
  };
}

export async function verifyProgramExists(
  programId: string,
  tx:        Prisma.TransactionClient = prisma,
): Promise<boolean> {
  const program = await tx.program.findUnique({
    where:  { id: programId },
    select: { id: true },
  });
  return program !== null;
}