// src/modules/payment/payment.schema.ts
import { z } from "zod";

export const InitializePaymentSchema = z.object({
  orderId: z.string().uuid("Order ID must be a valid UUID"),
});

export const VerifyPaymentQuerySchema = z.object({
  reference: z.string().min(1, "Reference is required"),
});

export type InitializePaymentDTO = z.infer<typeof InitializePaymentSchema>;
