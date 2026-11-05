import { z } from "zod";

// ── Learner-facing (read) ────────────────────────────────────────────────
export const ListEnrollmentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListEnrollmentsQuery = z.infer<typeof ListEnrollmentsQuerySchema>;

export const EnrollmentIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ── Admin grant (replaces the unused CreateEnrollmentSchema) ──────────────
// Not wired to a route yet. It must call the SAME upsert used by payment
// fulfillment so grants and purchases share renewal/upgrade semantics.
const AccessSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("lifetime") }),
  z.object({ mode: z.literal("days"), days: z.number().int().min(1).max(3650) }),
  z.object({
    mode: z.literal("until"),
    expiresAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
      message: "expiresAt must be in the future",
    }),
  }),
]);

export const GrantEnrollmentSchema = z.object({
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  access: AccessSchema,
  reason: z.string().trim().min(3).max(500),
});

export type GrantEnrollmentDTO = z.infer<typeof GrantEnrollmentSchema>;

export const IdempotencyKeyHeaderSchema = z.string().trim().min(1).max(100);