/**
 * enrollment.grant.service.ts
 *
 * Admin-only manual grant (support requests, scholarships, offline-paying
 * students, cohort access). Everything below commits atomically:
 *   idempotency claim -> validation -> grant -> audit log -> notification.
 * The email job is enqueued AFTER commit so a rollback can never send a
 * message about access that does not exist.
 */

import { Prisma, type EnrollmentStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { forbidden, notFound } from "../../utils/errors";
import { withMetrics } from "../../utils/observability";
import { grantEnrollmentForCourse, type AccessRequest } from "./enrollment.commands";
import type { GrantEnrollmentDTO } from "./enrollment.schema";

const GRANT_ROLES = new Set(["admin", "superadmin"]);

/** JSON-safe (dates as ISO strings) so it can be stored for idempotent replay. */
export interface GrantResult {
  enrollmentId: string;
  isNew: boolean;
  changed: boolean;
  status: EnrollmentStatus;
  expiresAt: string | null;
}

function toAccessRequest(a: GrantEnrollmentDTO["access"]): AccessRequest {
  switch (a.mode) {
    case "lifetime":
      return { kind: "lifetime" };
    case "days":
      return { kind: "days", days: a.days };
    case "until":
      return { kind: "until", at: a.expiresAt };
  }
}

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function grantEnrollmentService(
  actor: { id: string; role: string },
  input: GrantEnrollmentDTO,
  idempotencyKey: string,
): Promise<GrantResult> {
  // Defense in depth: the route guard is the primary check.
  if (!GRANT_ROLES.has(actor.role)) throw forbidden("Admin access required");

  const scope = `enrollment.grant:${actor.id}`;

  return withMetrics("enrollment.grant", async () => {
    try {
      const committed = await prisma.$transaction(async (tx) => {
        // 1. Claim the idempotency key. A concurrent duplicate blocks on the
        //    unique index until we commit, then gets P2002 (handled below).
        await tx.idempotencyKey.create({ data: { key: idempotencyKey, scope } });

        // 2. Validate targets inside the transaction.
        const [user, course] = await Promise.all([
          tx.user.findFirst({ where: { id: input.userId, deletedAt: null }, select: { id: true } }),
          tx.course.findFirst({ where: { id: input.courseId, deletedAt: null }, select: { id: true, title: true } }),
        ]);
        if (!user) throw notFound("User not found");
        if (!course) throw notFound("Course not found");

        // 3. Grant (locks per learner/course, never shortens access).
        const outcome = await grantEnrollmentForCourse(tx, {
          userId: input.userId,
          courseId: input.courseId,
          grantedById: actor.id,
          reason: input.reason,
          access: toAccessRequest(input.access),
        });

        // 4. Audit + notify only when something actually changed.
        if (outcome.changed) {
          const audit = await tx.adminAuditLog.create({
            data: {
              adminId: actor.id,
              action: outcome.isNew
                ? "ENROLLMENT_GRANTED"
                : outcome.before?.status === "ACTIVE"
                  ? "ENROLLMENT_EXTENDED"
                  : "ENROLLMENT_REACTIVATED",
              targetType: "Enrollment",
              targetId: outcome.id,
              metadata: {
                userId: input.userId,
                courseId: input.courseId,
                reason: input.reason,
                request: input.access,
                before: outcome.before
                  ? { status: outcome.before.status, expiresAt: outcome.before.expiresAt?.toISOString() ?? null }
                  : null,
                after: { status: outcome.after.status, expiresAt: outcome.after.expiresAt?.toISOString() ?? null },
              } satisfies Prisma.InputJsonObject,
            },
            select: { id: true },
          });

          await tx.notification.create({
            data: {
              userId: input.userId,
              type: "ENROLLMENT_GRANTED",
              title: `You now have access to ${course.title}`,
              refType: "Enrollment",
              refId: outcome.id,
              dedupeKey: `enrollment-granted:${outcome.id}:${audit.id}`,
            },
          });
        }

        const result: GrantResult = {
          enrollmentId: outcome.id,
          isNew: outcome.isNew,
          changed: outcome.changed,
          status: outcome.after.status,
          expiresAt: outcome.after.expiresAt?.toISOString() ?? null,
        };

        // 5. Store the response for idempotent replay (same transaction).
        await tx.idempotencyKey.update({
          where: { key_scope: { key: idempotencyKey, scope } },
          data: { response: result as unknown as Prisma.InputJsonValue, statusCode: 200 },
        });

        return result;
      });

      // TODO (after commit, outside the transaction): when committed.changed,
      // enqueue the Bull email job for the ENROLLMENT_GRANTED notification
      // so delivery is retried and tracked via NotificationDelivery.
      return committed;
    } catch (e) {
      if (isUniqueViolation(e)) {
        const stored = await prisma.idempotencyKey.findUnique({
          where: { key_scope: { key: idempotencyKey, scope } },
          select: { response: true },
        });
        if (stored?.response) return stored.response as unknown as GrantResult;
      }
      throw e;
    }
  });
}

/**
 * Guard used by checkout before any money moves or free fulfillment runs.
 *
 * Business rule:
 *   A learner whose enrollment for a course is REVOKED may not repurchase
 *   that course. ACTIVE and EXPIRED rows are allowed (ACTIVE becomes a
 *   renewal via upsertEnrollmentForCourse; EXPIRED is a normal repurchase).
 *
 * Throws forbidden if any of the supplied courseIds are currently revoked
 * for this user. Callers must invoke this before creating a Payment or
 * fulfilling a free order.
 */
export async function assertCoursesPurchasableService(
  userId: string,
  courseIds: string[],
): Promise<void> {
  if (courseIds.length === 0) return;

  const uniqueIds = [...new Set(courseIds)];

  const revoked = await prisma.enrollment.findMany({
    where: {
      userId,
      courseId: { in: uniqueIds },
      status: "REVOKED",
    },
    select: {
      courseId: true,
      course: { select: { title: true } },
    },
  });

  if (revoked.length === 0) return;

  const titles = revoked.map((r) => r.course.title).join(", ");
  throw forbidden(
    revoked.length === 1
      ? `You cannot purchase "${titles}" — access was revoked. Contact support.`
      : `You cannot purchase these courses — access was revoked: ${titles}. Contact support.`,
  );
}