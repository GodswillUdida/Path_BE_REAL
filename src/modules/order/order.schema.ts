import { z } from "zod";

/**
 * @file order.schema.ts
 * @description Ingestion validation engine for client checkouts.
 * Enforces strict single-seat purchase constraints to prevent billing mismatches.
 */
export const CreateOrderSchema = z.object({
  items: z
    .array(
      z.object({
        pricingId: z.string().uuid("Invalid pricing ID format"),
        // Keeps your strict constraint but exports as a clean number type
        quantity: z.number().int().min(1).max(1).default(1),
      }),
    )
    .min(1, "At least one item is required to initialize checkout intent"),
  phone: z.string().trim().min(5, "Phone number provided is too short").optional(),
});

export type CreateOrderDTO = z.infer<typeof CreateOrderSchema>;
