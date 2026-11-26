import { z } from "zod";
import { ApplicantStatus } from "@prisma/client";

const emailSchema = z.email("Invalid email address").trim().toLowerCase();
const phoneSchema = z
  .string()
  .min(10, "Phone must be at least 10 digits")
  .regex(/^[\d+\-\s()]+$/, "Invalid phone format");
const nameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must not exceed 100 characters")
  .trim();
const addressSchema = z
  .string()
  .min(5, "Address must be at least 5 characters")
  .max(200, "Address must not exceed 200 characters")
  .trim();

const employmentSchema = z
  .object({
    placeOfWork: z
      .string()
      .max(100, "Place of work must not exceed 100 characters")
      .trim()
      .optional(),
    position: z
      .string()
      .max(100, "Position must not exceed 100 characters")
      .trim()
      .optional(),
  })
  .optional();

const sponsorSchema = z
  .object({
    name: nameSchema.optional(),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    location: z
      .string()
      .max(100, "Location must not exceed 100 characters")
      .trim()
      .optional(),
    workplace: z
      .string()
      .max(100, "Workplace must not exceed 100 characters")
      .trim()
      .optional(),
  })
  .optional();

export const createApplicantSchema = z.object({
  fullName: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  address: addressSchema,
  lectureCenter: z
    .string()
    .max(100, "Lecture center must not exceed 100 characters")
    .trim()
    .optional(),
  previousCenter: z
    .string()
    .max(100, "Previous center must not exceed 100 characters")
    .trim()
    .optional(),
  isNewStudent: z.boolean().default(true),
  level: z
    .string()
    .max(50, "Level must not exceed 50 characters")
    .trim()
    .optional(),
  careerChallenges: z
    .string()
    .max(500, "Career challenges must not exceed 500 characters")
    .trim()
    .optional(),
  referredBy: z
    .string()
    .max(100, "Referred by must not exceed 100 characters")
    .trim()
    .optional(),
  documents: z.array(z.string().url("Invalid document URL")).optional(),
  papers: z
    .array(z.string().min(1, "Paper name is required").max(100).trim())
    .min(1, "At least one paper is required"),
  employment: employmentSchema,
  sponsor: sponsorSchema,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .optional(),
  cohortOfferId: z.string().uuid().optional(),
});

export const verifyRegistrationSchema = z.object({
  pendingId: z.string().uuid("Invalid verification reference"),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export const resendRegistrationSchema = z.object({
  pendingId: z.string().uuid("Invalid verification reference"),
});


export const updateApplicantSchema = createApplicantSchema
  .omit({ password: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export const updateApplicantStatusSchema = z.object({
  status: z.enum([
    ApplicantStatus.REVIEWED,
    ApplicantStatus.APPROVED,
    ApplicantStatus.REJECTED,
  ] as const),
});

export const listApplicantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(ApplicantStatus).optional(),
  search: z.string().max(100).trim().optional(),
  sortBy: z.enum(["createdAt", "fullName"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateApplicantInput = z.infer<typeof createApplicantSchema>;
export type UpdateApplicantInput = z.infer<typeof updateApplicantSchema>;
export type UpdateApplicantStatusInput = z.infer<
  typeof updateApplicantStatusSchema
>;
export type ListApplicantsQuery = z.infer<typeof listApplicantsQuerySchema>;
