// src/modules/payment/payment.schema.ts
import { z } from "zod";

export const InitializePaymentSchema = z.object({
  // Guest or logged-in user identity (email required, name/phone optional)
  email: z.string().email("Valid email is required"),
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  phone: z.string().optional(),

  // Cart items — at least one required
  items: z
    .array(
      z.object({
        pricingId: z.string().uuid("Invalid pricing ID"),
        quantity: z.number().int().min(1).default(1),
      }),
    )
    .min(1, "Cart cannot be empty"),
});

export type InitializePaymentDTO = z.infer<typeof InitializePaymentSchema>;
