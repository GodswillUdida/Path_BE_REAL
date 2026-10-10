import { z } from "zod";

/**
 * ⚠️ CURRENTLY UNUSED — no controller/route calls this. Enrollment
 * creation happens exclusively through payment fulfillment
 * (payment.queries.ts's upsertEnrollmentForCourse), triggered by a paid
 * or free order, never via a direct API call.
 *
 * This is either:
 *   (a) leftover from before that design was settled, and safe to delete, or
 *   (b) the start of a genuinely useful admin feature — manually granting
 *       a course to a user (support requests, scholarships, comped access)
 *       — that was never finished.
 *
 * Left in place rather than silently deleted since (b) is a common,
 * legitimate LMS need and this looks like a real attempt at it. If you
 * want that feature, it needs: an admin-only route/controller, a service
 * function that calls the SAME upsertEnrollmentForCourse used by payment
 * fulfillment (so admin grants and paid enrollments behave identically —
 * same renewal/upgrade semantics, no separate code path to drift), and
 * probably an accessDurationDays override here since an admin grant may
 * not correspond to any real CoursePricing row. If not wanted, delete
 * this file and the schema below.
 */
export const CreateEnrollmentSchema = z.object({
  courseId: z.string().uuid(),
  pricingId: z.string().uuid(),
  orderItemId: z.string().uuid().optional(),
});

export type CreateEnrollmentDTO = z.infer<typeof CreateEnrollmentSchema>;

// REMOVED: DURATION_DAYS_MAP / computeEnrollmentExpiry / isEnrollmentActive
// (previously commented out) — these referenced CoursePricingDuration, an
// enum that no longer exists anywhere in the schema (CoursePricing.
// accessDurationDays is a plain nullable Int now, null = lifetime, per an
// explicit schema comment: "DO NOT introduce a separate duration enum").
// This exact logic already lives correctly in payment.queries.ts's
// upsertEnrollmentForCourse — no reason to keep a stale, non-functional
// duplicate around even as a comment.