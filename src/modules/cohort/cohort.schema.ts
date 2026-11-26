import { z } from "zod";
import { CohortMemberStatus, CohortStatus } from "@prisma/client";

const uuid = z.string().uuid();
const nonEmpty = z.string().trim().min(1).max(200);

export const createCohortSchema = z
  .object({
    name: nonEmpty,
    slug: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case")
      .optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    centre: z.string().trim().max(200).optional().nullable(),
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
    capacity: z.number().int().positive().optional().nullable(),
  })
  .refine((d) => !d.startsAt || !d.endsAt || d.endsAt >= d.startsAt, {
    message: "endsAt must be on or after startsAt",
    path: ["endsAt"],
  });

export const updateCohortSchema = createCohortSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: "At least one field is required" },
);

export const transitionCohortSchema = z.object({
  status: z.enum([
    CohortStatus.DRAFT,
    CohortStatus.UPCOMING,
    CohortStatus.ACTIVE,
    CohortStatus.COMPLETED,
    CohortStatus.ARCHIVED,
    CohortStatus.CANCELLED,
  ]),
  reason: z.string().trim().max(500).optional(),
});

export const listCohortsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(CohortStatus).optional(),
  search: z.string().trim().max(100).optional(),
  centre: z.string().trim().max(200).optional(),
  includeDeleted: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const addCohortCourseSchema = z.object({
  courseId: uuid,
});

export const createCohortOfferSchema = z
  .object({
    name: nonEmpty,
    price: z.coerce.number().nonnegative(),
    currency: z.string().trim().length(3).default("NGN"),
    includesCourseAccess: z.boolean().default(true),
    bonusDays: z.number().int().min(0).max(3650).default(0),
    opensAt: z.coerce.date().optional().nullable(),
    closesAt: z.coerce.date().optional().nullable(),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
  })
  .refine((d) => !d.opensAt || !d.closesAt || d.closesAt >= d.opensAt, {
    message: "closesAt must be on or after opensAt",
    path: ["closesAt"],
  });

export const updateCohortOfferSchema = createCohortOfferSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: "At least one field is required" },
);

export const grantMemberSchema = z.object({
  userId: uuid,
  /** null = permanent (no expiry); omit = default cohort.endsAt */
  expiresAt: z.coerce.date().optional().nullable(),
  reason: z.string().trim().min(1).max(500),
});

export const memberStatusSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const assignInstructorSchema = z.object({
  userId: uuid,
});

export const discoveryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  centre: z.string().trim().max(200).optional(),
});

export type CreateCohortInput = z.infer<typeof createCohortSchema>;
export type UpdateCohortInput = z.infer<typeof updateCohortSchema>;
export type TransitionCohortInput = z.infer<typeof transitionCohortSchema>;
export type ListCohortsQuery = z.infer<typeof listCohortsQuerySchema>;
export type CreateCohortOfferInput = z.infer<typeof createCohortOfferSchema>;
export type UpdateCohortOfferInput = z.infer<typeof updateCohortOfferSchema>;
export type GrantMemberInput = z.infer<typeof grantMemberSchema>;
