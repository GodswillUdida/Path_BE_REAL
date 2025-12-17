"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrderSchema = void 0;
// src/modules/order/order.schema.ts
const zod_1 = require("zod");
exports.createOrderSchema = zod_1.z.object({
    enrollmentIds: zod_1.z.array(zod_1.z.uuid()).min(1),
    currency: zod_1.z.string().default("NGN").optional(),
});
// export const orderResponseSchema = z.object({
//   id: z.string().uuid(),
//     userId: z.string().uuid(),
//     totalAmount: z.number(),
//     currency: z.string(),
//     status: z.enum(["PENDING", "COMPLETED", "FAILED"]),
//     createdAt: z.string(),
//     updatedAt: z.string(),
// });
// export type OrderResponseDTO = z.infer<typeof orderResponseSchema>;
