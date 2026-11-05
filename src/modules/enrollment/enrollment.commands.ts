/**
 * enrollment.commands.ts
 *
 * THE ONLY place enrollments are created or have their access window
 * changed. Purchases (payment fulfillment) and admin grants both go
 * through here, so renewal / extension / reactivation semantics cannot
 * drift between the two paths.
 *
 * Invariants (backed by DB constraints in manual_constraints.sql):
 *  - One Enrollment per (userId, courseId). Renewals and grants UPDATE it.
 *  - `source`, `orderItemId`, `grantedById` are CREATION provenance and are
 *    NEVER modified on update. History of later changes lives in
 *    AdminAuditLog (grants) and Order/OrderItem/Payment (purchases).
 *  - PURCHASE rows require pricingId + orderItemId.
 *    ADMIN_GRANT rows require grantedById and have no orderItemId.
 *  - Access is never shortened by a purchase or a grant. Lifetime stays
 *    lifetime. Shortening is a separate, explicit admin operation.
 *
 * Concurrency: every function takes a per-(user, course) transaction
 * advisory lock first. Webhook + verify-endpoint races, double-clicked
 * admin grants, and a purchase racing a grant all serialize here, so the
 * read-then-write expiry math below is safe. The lock releases at
 * commit/rollback. Must be called inside a transaction.
 */

import type { EnrollmentStatus, Prisma } from "@prisma/client";

const DAY_MS = 86_400_000;

export type AccessRequest =
  | { kind: "lifetime" }
  | { kind: "days"; days: number }
  | { kind: "until"; at: Date };

interface Existing {
  id: string;
  status: EnrollmentStatus;
  expiresAt: Date | null; // null = lifetime
}

async function lockAndLoad(tx: Prisma.TransactionClient, userId: string, courseId: string): Promise<Existing | null> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${courseId}`}, 0))`;
  return tx.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true, status: true, expiresAt: true },
  });
}

/**
 * Next expiry. `null` = lifetime.
 *  - Existing lifetime access is never downgraded by a finite request.
 *  - A lifetime request always wins.
 *  - days  : extend from the later of {now, current expiry}.
 *  - until : never earlier than the current (future) expiry.
 */
export function computeNextExpiry(existing: Existing | null, req: AccessRequest, now: Date): Date | null {
  if (req.kind === "lifetime") return null;
  if (existing && existing.expiresAt === null) return null; // keep lifetime

  const current = existing?.expiresAt ?? null;

  if (req.kind === "days") {
    const base = current && current > now ? current : now;
    return new Date(base.getTime() + req.days * DAY_MS);
  }
  return current && current > req.at ? current : req.at;
}

const sameInstant = (a: Date | null, b: Date | null): boolean => (a?.getTime() ?? null) === (b?.getTime() ?? null);

// ─────────────────────────────────────────────────────────────────────────────
// PURCHASE (payment fulfillment)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Same signature and return shape as before, so existing callers are
 * unchanged.
 *
 * EXPIRY POLICY: renewal extends from the later of {now, current expiry};
 * lifetime always wins and is never downgraded. (Fixes a bug where a
 * finite purchase silently converted existing lifetime access to N days.)
 *
 * REVOKED enrollments are still reactivated here because the customer has
 * already paid and refusing after the fact loses money silently. Block the
 * purchase at ORDER CREATION instead (see recommendations).
 */
export async function upsertEnrollmentForCourse(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    courseId: string;
    pricingId: string;
    orderItemId: string;
    orderId: string;
    accessDurationDays: number | null;
    /** Free extra days on top of the paid duration (OrderItem.bonusDays snapshot). */
    bonusDays?: number;
  },
): Promise<{ id: string; isNew: boolean }> {
  const existing = await lockAndLoad(tx, params.userId, params.courseId);
  const now = new Date();

  // The free bonus is baked into expiresAt. Lifetime offers ignore it.
  const req: AccessRequest =
    params.accessDurationDays === null
      ? { kind: "lifetime" }
      : { kind: "days", days: params.accessDurationDays + (params.bonusDays ?? 0) };
  const expiresAt = computeNextExpiry(existing, req, now);

  if (!existing) {
    const created = await tx.enrollment.create({
      data: {
        userId: params.userId,
        courseId: params.courseId,
        source: "PURCHASE",
        pricingId: params.pricingId,
        orderItemId: params.orderItemId,
        orderId: params.orderId,
        status: "ACTIVE",
        startedAt: now,
        expiresAt,
      },
      select: { id: true },
    });
    return { id: created.id, isNew: true };
  }

  await tx.enrollment.update({
    where: { id: existing.id },
    data: {
      // source / orderItemId / grantedById are NEVER touched on update.
      pricingId: params.pricingId,
      orderId: params.orderId,
      status: "ACTIVE",
      expiresAt,
    },
  });
  return { id: existing.id, isNew: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN GRANT
// ─────────────────────────────────────────────────────────────────────────────

export interface AccessSnapshot {
  status: EnrollmentStatus;
  expiresAt: Date | null;
}

export interface GrantOutcome {
  id: string;
  isNew: boolean;
  /** false => request was a no-op (already has equal or longer access). */
  changed: boolean;
  before: AccessSnapshot | null;
  after: AccessSnapshot;
}

/**
 * Admin grants never shorten access. Granting to an EXPIRED or REVOKED
 * learner reactivates them: that is a deliberate human action and the
 * caller records before/after in AdminAuditLog.
 */
export async function grantEnrollmentForCourse(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    courseId: string;
    grantedById: string;
    reason: string;
    access: AccessRequest;
  },
): Promise<GrantOutcome> {
  const existing = await lockAndLoad(tx, params.userId, params.courseId);
  const now = new Date();
  const expiresAt = computeNextExpiry(existing, params.access, now);

  if (!existing) {
    const created = await tx.enrollment.create({
      data: {
        userId: params.userId,
        courseId: params.courseId,
        source: "ADMIN_GRANT",
        grantedById: params.grantedById,
        grantReason: params.reason,
        // pricingId / orderItemId / orderId intentionally absent
        status: "ACTIVE",
        startedAt: now,
        expiresAt,
      },
      select: { id: true },
    });
    return { id: created.id, isNew: true, changed: true, before: null, after: { status: "ACTIVE", expiresAt } };
  }

  const before: AccessSnapshot = { status: existing.status, expiresAt: existing.expiresAt };
  const after: AccessSnapshot = { status: "ACTIVE", expiresAt };
  const changed = before.status !== after.status || !sameInstant(before.expiresAt, after.expiresAt);

  if (changed) {
    await tx.enrollment.update({
      where: { id: existing.id },
      data: { status: after.status, expiresAt: after.expiresAt },
    });
  }
  return { id: existing.id, isNew: false, changed, before, after };
}

// ─────────────────────────────────────────────────────────────────────────────
// COHORT SEAT (bundled content from a paid live-class seat)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Content access bundled with a paid seat. `until` = cohort end + bonusDays
 * (null only if the cohort has no end date, which offer creation forbids).
 * Same invariants as every other path: never shortens access, lifetime stays
 * lifetime, creation provenance (source/cohortId) is never rewritten, and a
 * paid seat reactivates an EXPIRED/REVOKED row (the customer already paid;
 * block repurchase by revoked learners at order creation).
 */
export async function grantCohortSeatEnrollment(
  tx: Prisma.TransactionClient,
  params: { userId: string; courseId: string; cohortId: string; until: Date | null },
): Promise<{ id: string; isNew: boolean }> {
  const existing = await lockAndLoad(tx, params.userId, params.courseId);
  const now = new Date();
  const req: AccessRequest = params.until === null ? { kind: "lifetime" } : { kind: "until", at: params.until };
  const expiresAt = computeNextExpiry(existing, req, now);

  if (!existing) {
    const created = await tx.enrollment.create({
      data: {
        userId: params.userId,
        courseId: params.courseId,
        source: "COHORT_SEAT",
        cohortId: params.cohortId,
        status: "ACTIVE",
        startedAt: now,
        expiresAt,
      },
      select: { id: true },
    });
    return { id: created.id, isNew: true };
  }

  if (existing.status !== "ACTIVE" || !sameInstant(existing.expiresAt, expiresAt)) {
    await tx.enrollment.update({ where: { id: existing.id }, data: { status: "ACTIVE", expiresAt } });
  }
  return { id: existing.id, isNew: false };
}
