import { z } from "zod";

/**
 * @file order.schema.ts
 * An order line is EXACTLY ONE of: a course offer (pricingId) or a
 * live-class seat (cohortOfferId). Quantity stays fixed at 1 (single seat).
 */
const OrderItemSchema = z
  .object({
    pricingId: z.string().uuid("Invalid pricing ID format").optional(),
    cohortOfferId: z.string().uuid("Invalid cohort offer ID format").optional(),
    quantity: z.number().int().min(1).max(1).default(1),
  })
  .refine((i) => (i.pricingId === undefined) !== (i.cohortOfferId === undefined), {
    message: "Provide exactly one of pricingId or cohortOfferId",
  });

export const CreateOrderSchema = z.object({
  items: z
    .array(OrderItemSchema)
    .min(1, "At least one item is required to initialize checkout intent")
    .max(10)
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      for (const i of items) {
        const key = i.pricingId ? `p:${i.pricingId}` : `c:${i.cohortOfferId}`;
        if (seen.has(key)) ctx.addIssue({ code: "custom", message: "Duplicate item in order" });
        seen.add(key);
      }
    }),
  phone: z.string().trim().min(5, "Phone number provided is too short").optional(),
});

export type CreateOrderDTO = z.infer<typeof CreateOrderSchema>;

export const ListOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const OrderIdParamSchema = z.object({ id: z.string().uuid() });

export const IdempotencyKeyHeaderSchema = z.string().trim().min(8).max(128).optional();
