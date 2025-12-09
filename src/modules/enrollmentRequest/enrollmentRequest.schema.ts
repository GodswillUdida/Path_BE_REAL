import { z } from "zod";

export const enrollmentRequestSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters long"),
  email: z.email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 characters long"),

  programId: z.uuid().optional(),
  courseId: z.uuid().optional(),

  notes: z.string().optional(),
//   source: z.string().optional(),
//   metadata: z.any().optional(),
});


export type EnrollmentRequestInput = z.infer<
  typeof enrollmentRequestSchema
>;