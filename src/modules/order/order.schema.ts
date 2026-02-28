// order.schema.ts
// Zod validation — February 2026
// Supports single item or array (same pattern as CreateEnrollmentSchema)

import { z } from "zod";

export const CreateOrderItemSchema = z.object({
  pricingId: z.string().uuid("Invalid pricing ID"),
  quantity: z.number().int().positive().default(1).optional(),
});

export const CreateOrderSchema = z
  .union([CreateOrderItemSchema, z.array(CreateOrderItemSchema).min(1)])
  .transform((val): CreateOrderItemDTO[] => (Array.isArray(val) ? val : [val]));

export type CreateOrderItemDTO = z.infer<typeof CreateOrderItemSchema>;
export type CreateOrderDTO = CreateOrderItemDTO[]; // for service
