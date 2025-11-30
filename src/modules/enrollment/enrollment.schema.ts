import { z } from "zod";

export const CreateEnrollmentSchema = z.object({
  courseId: z.uuid(),
  pricingId: z.uuid(),
  programId: z.uuid().optional(),
  orderId: z.uuid().optional(),
});

export type CreateEnrollmentDTO = z.infer<typeof CreateEnrollmentSchema>;
