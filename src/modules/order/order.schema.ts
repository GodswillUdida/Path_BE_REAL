// // src/modules/order/order.schema.ts
// import { z } from "zod";

// export const createOrderSchema = z.object({
//   enrollmentIds: z.array(z.uuid()).min(1),
//   currency: z.string().default("NGN").optional(),
// });

// export type CreateOrderDTO = z.infer<typeof createOrderSchema>;

// // export const orderResponseSchema = z.object({
// //   id: z.string().uuid(),
// //     userId: z.string().uuid(),
// //     totalAmount: z.number(),
// //     currency: z.string(),
// //     status: z.enum(["PENDING", "COMPLETED", "FAILED"]),
// //     createdAt: z.string(),
// //     updatedAt: z.string(),
// // });
// // export type OrderResponseDTO = z.infer<typeof orderResponseSchema>;
