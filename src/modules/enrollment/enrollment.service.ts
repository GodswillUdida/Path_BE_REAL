/**
 * enrollment.service.ts
 *
 * Read-only. Creation/renewal/grants happen in ONE shared upsert (see
 * enrollment.repo.ts header). Nothing here may call
 * prisma.enrollment.create/update.
 */

import { notFound, forbidden } from "../../utils/errors";
import { withMetrics } from "../../utils/observability";
import * as repo from "./enrollment.repo";
import { hasActiveAccess, withAccess, type WithAccess } from "./enrollment.access";
import type { EnrollmentDetail, EnrollmentListItem } from "./enrollment.repo";

interface PageMeta {
  total: number;
  limit: number;
  offset: number;
  pages: number;
  hasMore: boolean;
}

export async function getUserEnrollmentsService(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ data: WithAccess<EnrollmentListItem>[]; meta: PageMeta }> {
  return withMetrics("enrollment.list", async () => {
    const { data, total } = await repo.findEnrollmentsForUser(userId, limit, offset);
    const now = new Date();
    return {
      data: data.map((e) => withAccess(e, now)),
      meta: {
        total,
        limit,
        offset,
        pages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
    };
  });
}

export async function getOneEnrollmentService(id: string, userId: string): Promise<WithAccess<EnrollmentDetail>> {
  return withMetrics("enrollment.getOne", async () => {
    const enrollment = await repo.findEnrollmentByIdForUser(id, userId);
    if (!enrollment) throw notFound("Enrollment not found");
    return withAccess(enrollment);
  });
}

/**
 * Content gate. Call from the video playback / resource download path
 * before issuing any signed URL. Reuse this instead of ad hoc status
 * checks so expiry is evaluated identically everywhere.
 */
export async function assertCourseAccessService(userId: string, courseId: string): Promise<void> {
  const window = await repo.findAccessWindow(userId, courseId);
  if (!window || !hasActiveAccess(window)) {
    throw forbidden("You do not have active access to this course");
  }
}

/**
 * Purchase gate, called before any payment or free fulfillment. Revocation
 * is a deliberate staff decision (abuse, fraud, chargeback); a repurchase
 * must not silently undo it. Staff can still re-grant explicitly.
 */
export async function assertCoursesPurchasableService(userId: string, courseIds: string[]): Promise<void> {
  const revoked = await repo.findRevokedCourseIds(userId, courseIds);
  if (revoked.length > 0) {
    throw forbidden("One or more courses in this order are not available for purchase on your account");
  }
}
