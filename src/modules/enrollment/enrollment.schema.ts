import { z } from "zod";

export const CreateEnrollmentSchema = z.object({
  courseId: z.uuid(),
  pricingId: z.uuid(),
  programId: z.uuid().optional(),
  orderId: z.uuid().optional(),
});

export const CreatePhysicalEnrollmentRequestSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  phone: z.string().min(10),

  programId: z.uuid().optional(),
  courseId: z.uuid().optional(),

  notes: z.string().optional(),
  source: z.string().optional(),
  metadata: z.any().optional(),
});

export type CreateEnrollmentDTO = z.infer<typeof CreateEnrollmentSchema>;

export type CreatePhysicalEnrollmentRequestInput = z.infer<
  typeof CreatePhysicalEnrollmentRequestSchema
>;
