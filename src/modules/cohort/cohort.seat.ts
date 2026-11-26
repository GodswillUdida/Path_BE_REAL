/**
 * cohort.seat.ts
 * Fulfillment of a paid live-class seat (called from order fulfillment,
 * inside its transaction).
 *
 *   live access    -> CohortMember, expiresAt = cohort.endsAt
 *   bundled content-> Enrollment (COHORT_SEAT) per CohortCourse, expiring at
 *                     cohort.endsAt + bonusDays
 *
 * Capacity is enforced under a per-cohort advisory lock. ACTIVE + SUSPENDED
 * members occupy capacity (suspended paid seats are not resold).
 * StudentProfile is NEVER created here.
 */

import type { Prisma } from "@prisma/client";
import logger from "@/utils/logger";
import { grantCohortSeatEnrollment } from "../enrollment/enrollment.commands";

const DAY_MS = 86_400_000;

export type SeatOutcome =
  | { kind: "joined" | "already_member"; cohortId: string; newEnrollments: { id: string; courseId: string }[] }
  | { kind: "full"; cohortId: string }
  | {
      kind: "ineligible";
      cohortId: string;
      reason: "NO_STUDENT_PROFILE" | "STUDENT_NOT_ACTIVE" | "MEMBER_SUSPENDED" | "MEMBER_REMOVED";
    };

export async function fulfillCohortSeat(
  tx: Prisma.TransactionClient,
  p: { userId: string; offerId: string; orderItemId: string; bonusDays: number },
): Promise<SeatOutcome> {
  const offer = await tx.cohortOffer.findUniqueOrThrow({
    where: { id: p.offerId },
    select: {
      includesCourseAccess: true,
      cohort: {
        select: {
          id: true,
          endsAt: true,
          capacity: true,
          courses: { select: { courseId: true }, orderBy: { courseId: "asc" } },
        },
      },
    },
  });
  const cohort = offer.cohort;

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cohort:${cohort.id}`}, 0))`;

  const profile = await tx.studentProfile.findUnique({
    where: { userId: p.userId },
    select: { id: true, status: true },
  });
  if (!profile) {
    logger.error("payment.anomaly.student_ineligible: no StudentProfile for seat", {
      userId: p.userId,
      cohortId: cohort.id,
      orderItemId: p.orderItemId,
    });
    return { kind: "ineligible", cohortId: cohort.id, reason: "NO_STUDENT_PROFILE" };
  }
  if (profile.status !== "ACTIVE") {
    logger.error("payment.anomaly.student_ineligible: StudentProfile not ACTIVE", {
      userId: p.userId,
      cohortId: cohort.id,
      orderItemId: p.orderItemId,
      status: profile.status,
    });
    return { kind: "ineligible", cohortId: cohort.id, reason: "STUDENT_NOT_ACTIVE" };
  }

  const existing = await tx.cohortMember.findUnique({
    where: { cohortId_userId: { cohortId: cohort.id, userId: p.userId } },
    select: { id: true, status: true, orderItemId: true },
  });

  if (existing?.status === "SUSPENDED") {
    logger.error("payment.anomaly.member_suspended: paid seat but membership is suspended", {
      userId: p.userId,
      cohortId: cohort.id,
      orderItemId: p.orderItemId,
    });
    return { kind: "ineligible", cohortId: cohort.id, reason: "MEMBER_SUSPENDED" };
  }
  if (existing?.status === "REMOVED") {
    logger.error("payment.anomaly.member_removed: paid seat but membership was removed", {
      userId: p.userId,
      cohortId: cohort.id,
      orderItemId: p.orderItemId,
    });
    return { kind: "ineligible", cohortId: cohort.id, reason: "MEMBER_REMOVED" };
  }

  let kind: "joined" | "already_member" = "already_member";

  if (!existing || existing.status !== "ACTIVE") {
    if (cohort.capacity !== null) {
      const taken = await tx.cohortMember.count({
        where: { cohortId: cohort.id, status: { in: ["ACTIVE", "SUSPENDED"] } },
      });
      if (taken >= cohort.capacity) return { kind: "full", cohortId: cohort.id };
    }

    if (!existing) {
      await tx.cohortMember.create({
        data: {
          cohortId: cohort.id,
          userId: p.userId,
          status: "ACTIVE",
          source: "PURCHASE",
          orderItemId: p.orderItemId,
          expiresAt: cohort.endsAt,
        },
      });
    } else {
      await tx.cohortMember.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          leftAt: null,
          expiresAt: cohort.endsAt,
          ...(existing.orderItemId ? {} : { orderItemId: p.orderItemId }),
        },
      });
    }
    kind = "joined";
  } else if (!existing.orderItemId) {
    await tx.cohortMember.update({ where: { id: existing.id }, data: { orderItemId: p.orderItemId } });
  }

  const newEnrollments: { id: string; courseId: string }[] = [];

  if (offer.includesCourseAccess) {
    if (!cohort.endsAt) {
      logger.error("COHORT_MISSING_END_DATE: bundled access granted with no expiry", { cohortId: cohort.id });
    }
    const until = cohort.endsAt ? new Date(cohort.endsAt.getTime() + p.bonusDays * DAY_MS) : null;

    for (const { courseId } of cohort.courses) {
      const r = await grantCohortSeatEnrollment(tx, {
        userId: p.userId,
        courseId,
        cohortId: cohort.id,
        until,
      });
      if (r.isNew) newEnrollments.push({ id: r.id, courseId });
    }
  }

  return { kind, cohortId: cohort.id, newEnrollments };
}
