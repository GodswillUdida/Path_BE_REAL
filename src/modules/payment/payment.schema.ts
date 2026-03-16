// src/modules/payment/payment.schema.ts
import { z } from "zod";

export const InitializePaymentSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
});

export type InitializePaymentDTO = z.infer<typeof InitializePaymentSchema>;