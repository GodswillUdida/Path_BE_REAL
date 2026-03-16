import { z } from "zod";

// export const CreateOrderItemSchema = z.object({
//   pricingId: z.string().uuid("Invalid pricing ID"),
//   quantity: z.number().int().positive().default(1).optional(),
// });

export const CreateOrderSchema = z.object({
  email: z.string().email(),

  name: z.string().min(2).max(120).optional(),

  phone: z.string().min(7).max(20).optional(),

  // pricingId: z.string().uuid(),
  // quantity: z.number().int().min(1).default(1),

  items: z
    .array(
      z.object({
        pricingId: z.string().uuid(),
        quantity: z.number().int().min(1).default(1),
      }),
    )
    .min(1),
});

// export type CreateOrderItemSchemaDTO = z.infer<typeof CreateOrderItemSchema>;
export type CreateOrderDTO = z.infer<typeof CreateOrderSchema>;
