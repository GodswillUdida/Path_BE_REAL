import { zBooleanLoose, zJsonArray } from "@/utils/zodHelpers";
import { z } from "zod";
import {
  CourseStatus as PrismaCourseStatus,
  CourseLevel as PrismaCourseLevel,
} from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export const CourseStatusEnum = z.nativeEnum(PrismaCourseStatus);
export const CourseLevelEnum = z.nativeEnum(PrismaCourseLevel);

export type CourseStatus = z.infer<typeof CourseStatusEnum>;
export type CourseLevel = z.infer<typeof CourseLevelEnum>;

// ─────────────────────────────────────────────────────────────────────────────
// ACCESS DURATION
//
// SCHEMA CHANGE: CoursePricing.durationDays (required Int, enum-mapped) →
// CoursePricing.accessDurationDays (nullable Int). null = lifetime access.
// The old CoursePricingDurationEnum / DAY_COUNT_TO_ENUM mapping is DELETED —
// there is no enum in the new schema, accessDurationDays is a raw nullable
// Int and is the single source of truth (per schema comment: "DO NOT
// introduce a separate duration enum").
//
// zAccessDurationDays accepts:
//   - a positive integer (7, 14, 30, 90, 365, ...)
//   - the literal string "LIFETIME" (case-insensitive) → null
//   - omitted / null → null (lifetime)
//
// Multipart/form-data coercion note: numbers arrive as strings from
// multipart bodies, so numeric-string input must coerce before the
// LIFETIME check short-circuits it.
// ─────────────────────────────────────────────────────────────────────────────

export const zAccessDurationDays = z.preprocess((val) => {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "string" && val.trim().toUpperCase() === "LIFETIME") {
    return null;
  }
  const numeric = typeof val === "number" ? val : Number(val);
  return Number.isFinite(numeric) ? numeric : val; // let the schema below reject garbage
}, z.number().int().positive("accessDurationDays must be a positive integer, or omitted/LIFETIME for lifetime access").nullable());

// ─────────────────────────────────────────────────────────────────────────────
// PRICING
//
// SCHEMA CHANGE: price is `Decimal @db.Decimal(10,2)` in Postgres now, not
// Float. Zod still validates as `number` at the boundary (Prisma handles the
// Decimal conversion on write) — but we cap to 2 decimal places here so a
// value like 19.999 doesn't silently truncate/round differently than the
// DB does, which would make the API's echoed price diverge from what was
// actually persisted.
//
// `id` is optional — present on update (upsert), absent on create (insert).
// ─────────────────────────────────────────────────────────────────────────────

export const coursePricingSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(100).trim().optional(),
    price: z.coerce
      .number()
      .min(0)
      .multipleOf(0.01, "price must have at most 2 decimal places"),
    isFree: zBooleanLoose.default(false),
    currency: z
      .string()
      .length(3, "Must be a valid ISO 4217 currency code")
      .default("NGN"),
    accessDurationDays: zAccessDurationDays.default(null),
    sortOrder: z.coerce.number().int().default(0),
    isActive: zBooleanLoose.default(true),
  })
  .refine((data) => !data.isFree || data.price === 0, {
    message: "price must be 0 when isFree is true",
    path: ["price"],
  });

// ─────────────────────────────────────────────────────────────────────────────
// CREATE COURSE
//
// SCHEMA CHANGES APPLIED:
//   - `duration` REMOVED. Course.totalDurationSeconds is a service-managed
//     denormalized aggregate (SUM of Module.totalDurationSeconds). Accepting
//     it from the client would let a caller desync the cache from its
//     source of truth — this is a hard removal, not a rename.
//   - `programId` REMOVED as a direct Course field — Course no longer has
//     a programId column. Program linkage now goes through ProgramCourse
//     (see course.repository.ts insertCourse). The route-param programId
//     is still accepted by the controller and passed to the service, which
//     is responsible for creating the ProgramCourse row in the same
//     transaction as the Course — it is NOT part of this DTO because it's
//     not a Course column.
//   - `level` was already a required enum with a default — unchanged,
//     matches new schema (CourseLevel is required there too).
// ─────────────────────────────────────────────────────────────────────────────

export const createCourseSchema = z.object({
  title: z
    .string()
    .min(2, "Title must be at least 2 characters")
    .max(200, "Title must be at most 200 characters")
    .trim(),

  slug: z
    .string()
    .toLowerCase()
    .regex(
      /^[a-z0-9-]+$/,
      "Slug may only contain lowercase letters, numbers, and hyphens",
    )
    .optional(),

  // NEW REQUIRED FIELD on the schema: Course.code is unique and required.
  // Not present in the old model at all. Marked required here — if you want
  // server-generated codes instead of client-supplied, move generation into
  // the service and make this .optional() instead.
  code: z
    .string()
    .min(2, "Code must be at least 2 characters")
    .max(50, "Code must be at most 50 characters")
    .trim(),

  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(5000, "Description must be at most 5,000 characters")
    .trim(),

  thumbnail: z.string().url("Invalid thumbnail URL").optional(),
  videoPreview: z.string().url("Invalid video preview URL").optional(),

  level: CourseLevelEnum.default("BEGINNER"),

  status: CourseStatusEnum.default("DRAFT"),

  // NEW FIELD: distinguishes internal-diploma courses (org issues a
  // certificate) from exam-prep/tutoring tracks. Defaults false — a course
  // must opt into certificate issuance explicitly.
  issuesCertificate: zBooleanLoose.default(false),

  tags: zJsonArray(z.string().trim().min(1)).default([]),

  pricings: zJsonArray(coursePricingSchema).refine(
    (arr) => Array.isArray(arr) && arr.length >= 1,
    { message: "At least one pricing tier is required" },
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE COURSE
// ─────────────────────────────────────────────────────────────────────────────

export const updateCourseSchema = createCourseSchema.partial().extend({
  pricings: zJsonArray(coursePricingSchema).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// LIST QUERY PARAMS
//
// SCHEMA CHANGE: `programId` filter can no longer be a direct where-clause
// on Course (no such column). Filtering by program now requires a relation
// filter through ProgramCourse — handled in course.repository.ts's
// buildCourseWhereInput via `programs: { some: { programId } }`. The query
// param name is left as `programId` for API-contract stability; only the
// repository's translation to Prisma changes.
// ─────────────────────────────────────────────────────────────────────────────

export const listCoursesQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  tag: z.string().trim().min(1).max(50).optional(),
  status: CourseStatusEnum.optional(),
  level: CourseLevelEnum.optional(),
  programId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type CoursePricingInput = z.infer<typeof coursePricingSchema>;
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;