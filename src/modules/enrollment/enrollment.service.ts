/**
 * enrollment.service.ts
 *
 * Read-only. Creation/renewal happens exclusively in payment fulfillment
 * (payment.queries.ts's upsertEnrollmentForCourse) — never here. Nothing
 * in this module should ever call prisma.enrollment.create/update.
 */

import { notFound, forbidden } from "../../utils/errors";
import { withMetrics } from "../../utils/observability";
import * as repo from "./enrollment.repo";
import type { EnrollmentDetail, EnrollmentListItem } from "./enrollment.repo";

export async function getUserEnrollmentsService(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ data: EnrollmentListItem[]; meta: { total: number; limit: number; offset: number; pages: number; hasMore: boolean } }> {
  return withMetrics("enrollment.list", async () => {
    const { data, total } = await repo.findEnrollmentsForUser(userId, limit, offset);
    return {
      data,
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

export async function getOneEnrollmentService(id: string, userId: string): Promise<EnrollmentDetail> {
  return withMetrics("enrollment.getOne", async () => {
    const enrollment = await repo.findEnrollmentById(id);
    if (!enrollment) throw notFound("Enrollment not found");
    if (enrollment.userId !== userId) {
      throw forbidden("Access denied — this enrollment belongs to another user");
    }
    return enrollment;
  });
}