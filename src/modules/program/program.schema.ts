import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export const ProgramStatusEnum = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type ProgramStatus = z.infer<typeof ProgramStatusEnum>;

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
//
// - slug is normalized to lowercase at schema level via .transform()
//   so "My-Program" becomes "my-program" rather than failing validation
// - image is constrained to http(s) only — rejects ftp://, ws://, etc.
// - description has an upper bound to prevent payload abuse
// ─────────────────────────────────────────────────────────────────────────────

export const createProgramSchema = z
  .object({
    title: z
      .string()
      .min(2,   "Title must be at least 2 characters")
      .max(200, "Title must be at most 200 characters")
      .trim(),

    description: z
      .string()
      .min(10,   "Description must be at least 10 characters")
      .max(5000, "Description must be at most 5,000 characters")
      .trim(),

    image: z
      .string()
      .url("Invalid image URL")
      .refine(
        (url) => url.startsWith("https://") || url.startsWith("http://"),
        "Image URL must use http or https",
      )
      .optional(),

    slug: z
      .string()
      .min(2)
      .max(100)
      .transform((v) => v.toLowerCase())
      .refine(
        (v) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v),
        "Slug must be lowercase alphanumeric with hyphens only",
      )
      .optional(),

    status: ProgramStatusEnum.default("DRAFT"),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// Derived cleanly — no field re-declared, status explicitly optional.
// ─────────────────────────────────────────────────────────────────────────────

export const updateProgramSchema = createProgramSchema
  .omit({ status: true })
  .partial()
  .extend({
    status: ProgramStatusEnum.optional(),
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────────────
// LIST QUERY PARAMS
// ─────────────────────────────────────────────────────────────────────────────

export const listProgramsQuerySchema = z.object({
  q:      z.string().trim().min(1).max(100).optional(),
  status: ProgramStatusEnum.optional(),
  limit:  z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type CreateProgramDTO    = z.infer<typeof createProgramSchema>;
export type UpdateProgramDTO    = z.infer<typeof updateProgramSchema>;
export type ListProgramsQuery   = z.infer<typeof listProgramsQuerySchema>;