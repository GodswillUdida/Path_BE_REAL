/**
 * enrollment.repo.ts
 *
 * Single point of contact with Prisma for the Enrollment domain.
 * Read-only. Creation/renewal/grants go through ONE upsert shared with
 * payment fulfillment (payment.queries.ts -> upsertEnrollmentForCourse).
 *
 * Schema v2 effects: pricingId, orderItemId are nullable (ADMIN_GRANT
 * rows have neither), so `pricing`, `order` and `orderItem` below are
 * nullable in the inferred types. `source` is exposed so the client can
 * label granted vs purchased access. grantedById/grantReason are staff
 * internal and are never selected here.
 */

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { AccessWindow } from "./enrollment.access";

export const ENROLLMENT_DETAIL_SELECT = {
  id: true,
  courseId: true,
  pricingId: true,
  orderItemId: true,
  orderId: true,
  source: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  completedAt: true,
  progressPercentage: true,
  course: {
    select: {
      id: true,
      title: true,
      slug: true,
      thumbnail: true,
      level: true,
      issuesCertificate: true,
      modules: {
        where: { deletedAt: null },
        orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true,
          title: true,
          position: true,
          totalDurationSeconds: true,
          topics: {
            where: { deletedAt: null },
            orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
            select: {
              id: true,
              title: true,
              position: true,
              durationSeconds: true,
              videoAsset: {
                select: { status: true, thumbnailUrl: true, durationSeconds: true },
              },
            },
          },
        },
      },
    },
  },
  pricing: {
    select: { id: true, name: true, price: true, currency: true, isFree: true, accessDurationDays: true },
  },
  progressRecords: {
    select: { id: true, topicId: true, completed: true, watchedSeconds: true, lastWatchedAt: true },
  },
  certificate: {
    select: { id: true, issuedAt: true, url: true, verification: true },
  },
  order: { select: { id: true, status: true, createdAt: true } },
  orderItem: { select: { id: true, unitPrice: true, createdAt: true } },
} satisfies Prisma.EnrollmentSelect;

export type EnrollmentDetail = Prisma.EnrollmentGetPayload<{ select: typeof ENROLLMENT_DETAIL_SELECT }>;

export const ENROLLMENT_LIST_SELECT = {
  id: true,
  courseId: true,
  source: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  completedAt: true,
  progressPercentage: true,
  course: { select: { id: true, title: true, slug: true, thumbnail: true } },
  pricing: { select: { id: true, name: true, accessDurationDays: true } },
} satisfies Prisma.EnrollmentSelect;

export type EnrollmentListItem = Prisma.EnrollmentGetPayload<{ select: typeof ENROLLMENT_LIST_SELECT }>;

export async function findEnrollmentsForUser(
  userId: string,
  limit: number,
  offset: number,
): Promise<{ data: EnrollmentListItem[]; total: number }> {
  const [total, data] = await prisma.$transaction([
    prisma.enrollment.count({ where: { userId } }),
    prisma.enrollment.findMany({
      where: { userId },
      select: ENROLLMENT_LIST_SELECT,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      skip: offset,
      take: limit,
    }),
  ]);
  return { data, total };
}

/**
 * Ownership is part of the query, not a post-fetch check. A caller can
 * never distinguish "doesn't exist" from "belongs to someone else", and
 * the heavy curriculum tree is never loaded for the wrong user.
 */
export async function findEnrollmentByIdForUser(id: string, userId: string): Promise<EnrollmentDetail | null> {
  return prisma.enrollment.findFirst({
    where: { id, userId },
    select: ENROLLMENT_DETAIL_SELECT,
  });
}

/**
 * Minimal row for access decisions (playback guard, cohort policy).
 */
export async function findAccessWindow(userId: string, courseId: string): Promise<AccessWindow | null> {
  return prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { status: true, startedAt: true, expiresAt: true },
  });
}

/** Courses this learner was explicitly REVOKED from. */
export async function findRevokedCourseIds(userId: string, courseIds: string[]): Promise<string[]> {
  const rows = await prisma.enrollment.findMany({
    where: { userId, courseId: { in: courseIds }, status: "REVOKED" },
    select: { courseId: true },
  });
  return rows.map((r) => r.courseId);
}
