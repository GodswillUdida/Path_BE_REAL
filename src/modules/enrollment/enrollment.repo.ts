/**
 * enrollment.repository.ts
 *
 * Single point of contact with Prisma for the Enrollment domain (read-only
 * — creation/renewal happens exclusively in payment fulfillment, see
 * payment.queries.ts's upsertEnrollmentForCourse).
 */

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// SELECT SHAPES
// ─────────────────────────────────────────────────────────────────────────────

// FIXED: previously `user: true` — every User scalar, including
// resetToken/resetTokenExpires/verificationToken/verificationExpires.
// Scoped to public-safe fields only, matching the pattern used everywhere
// else a User is embedded in a response (course.instructor, etc.).
const ENROLLMENT_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  profileImage: true,
  phone: true,
} satisfies Prisma.UserSelect;

export const ENROLLMENT_DETAIL_SELECT = {
  id: true,
  userId: true,
  courseId: true,
  pricingId: true,
  orderItemId: true,
  orderId: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  completedAt: true,
  progressPercentage: true,
  user: { select: ENROLLMENT_USER_SELECT },
  course: {
    select: {
      id: true,
      title: true,
      slug: true,
      thumbnail: true,
      level: true,
      issuesCertificate: true,
      // FIXED: previously `modules: { include: { topics: true } }` — no
      // deletedAt filter (soft-deleted curriculum would appear) and no
      // ordering (silently broke as soon as an instructor reordered
      // anything without re-inserting), same class of bug fixed earlier
      // in course/module/topic repositories. Also now nests videoAsset —
      // previously absent entirely, meaning a learner had no way to know
      // whether a topic's video was even playable.
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
  // REMOVED: `payments: true` — Enrollment has no relation to Payment at
  // all anymore (Payment relates only to Order). This field didn't exist
  // and would have thrown on every request to either enrollment endpoint.
} satisfies Prisma.EnrollmentSelect;

export type EnrollmentDetail = Prisma.EnrollmentGetPayload<{ select: typeof ENROLLMENT_DETAIL_SELECT }>;

// List view — deliberately shallow, no module/topic tree. A "my courses"
// list page needs enough to render a card, not the full curriculum.
export const ENROLLMENT_LIST_SELECT = {
  id: true,
  courseId: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  completedAt: true,
  progressPercentage: true,
  course: { select: { id: true, title: true, slug: true, thumbnail: true } },
  pricing: { select: { id: true, name: true, accessDurationDays: true } },
} satisfies Prisma.EnrollmentSelect;

export type EnrollmentListItem = Prisma.EnrollmentGetPayload<{ select: typeof ENROLLMENT_LIST_SELECT }>;

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

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
      orderBy: { startedAt: "desc" },
      skip: offset,
      take: limit,
    }),
  ]);
  return { data, total };
}

export async function findEnrollmentById(id: string): Promise<(EnrollmentDetail & { userId: string }) | null> {
  return prisma.enrollment.findUnique({
    where: { id },
    select: { ...ENROLLMENT_DETAIL_SELECT, userId: true },
  });
}