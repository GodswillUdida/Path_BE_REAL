import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export const ProgramStatusEnum = z.enum([
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
]);

export type ProgramStatus = z.infer<
  typeof ProgramStatusEnum
>;

// ─────────────────────────────────────────────────────────────────────────────
// COMMON SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

const programTitleSchema = z
  .string()
  .trim()
  .min(2, "Title must be at least 2 characters")
  .max(200, "Title must be at most 200 characters");

const programDescriptionSchema = z
  .string()
  .trim()
  .min(10, "Description must be at least 10 characters")
  .max(
    5000,
    "Description must be at most 5,000 characters",
  );

const programImageSchema = z
  .string()
  .url("Invalid image URL")
  .refine(
    (url) =>
      url.startsWith("https://") ||
      url.startsWith("http://"),
    "Image URL must use http or https",
  );

const programSlugSchema = z
  .string()
  .trim()
  .min(2, "Slug must be at least 2 characters")
  .max(100, "Slug must be at most 100 characters")
  .transform((value) => value.toLowerCase())
  .refine(
    (value) =>
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
    "Slug must be lowercase alphanumeric with hyphens only",
  );

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export const createProgramSchema = z
  .object({
    title: programTitleSchema,

    description: programDescriptionSchema,

    image: programImageSchema.optional(),

    slug: programSlugSchema.optional(),

    status:
      ProgramStatusEnum.default("DRAFT"),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
//
// undefined => leave unchanged
// string    => replace image
// null      => clear image
// ─────────────────────────────────────────────────────────────────────────────

export const updateProgramSchema = z
  .object({
    title: programTitleSchema.optional(),

    description:
      programDescriptionSchema.optional(),

    image: programImageSchema
      .nullable()
      .optional(),

    slug: programSlugSchema.optional(),

    status:
      ProgramStatusEnum.optional(),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────

export const listProgramsQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional(),

    status:
      ProgramStatusEnum.optional(),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20),

    offset: z.coerce
      .number()
      .int()
      .min(0)
      .default(0),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// REORDER
// ─────────────────────────────────────────────────────────────────────────────

export const  reorderProgramCourseSchema =
  z
    .object({
      courseId: z
        .string()
        .trim()
        .min(1, "Course ID is required"),

      position: z
        .coerce
        .number()
        .int()
        .min(
          0,
          "Position must be a non-negative integer",
        ),
    })
    .strict();

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CreateProgramDTO =
  z.infer<typeof createProgramSchema>;

export type UpdateProgramDTO =
  z.infer<typeof updateProgramSchema>;

export type ListProgramsQuery =
  z.infer<
    typeof listProgramsQuerySchema
  >;

export type ReorderProgramCourseDTO =
  z.infer<
    typeof reorderProgramCourseSchema
  >;