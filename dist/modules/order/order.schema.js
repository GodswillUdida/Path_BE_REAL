"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOrderSchema = void 0;
const zod_1 = require("zod");
// export const CreateOrderItemSchema = z.object({
//   pricingId: z.string().uuid("Invalid pricing ID"),
//   quantity: z.number().int().positive().default(1).optional(),
// });
exports.CreateOrderSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(2).max(120).optional(),
    phone: zod_1.z.string().min(7).max(20).optional(),
    // pricingId: z.string().uuid(),
    // quantity: z.number().int().min(1).default(1),
    items: zod_1.z
        .array(zod_1.z.object({
        pricingId: zod_1.z.string().uuid(),
        quantity: zod_1.z.number().int().min(1).default(1),
    }))
        .min(1),
});
