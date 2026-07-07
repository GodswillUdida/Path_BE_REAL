import { z } from "zod";

export const CreateOrderSchema = z.object({
  items: z
    .array(
      z.object({
        pricingId: z.string().uuid(),
        quantity: z.number().int().min(1).default(1),
      }),
    )
    .min(1),
  phone: z.string().optional(),
});

export type CreateOrderDTO = z.infer<typeof CreateOrderSchema>;
