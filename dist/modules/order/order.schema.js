"use strict";
// order.schema.ts
// Zod validation — February 2026
// Supports single item or array (same pattern as CreateEnrollmentSchema)
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOrderSchema = exports.CreateOrderItemSchema = void 0;
const zod_1 = require("zod");
exports.CreateOrderItemSchema = zod_1.z.object({
    pricingId: zod_1.z.string().uuid("Invalid pricing ID"),
    quantity: zod_1.z.number().int().positive().default(1).optional(),
});
exports.CreateOrderSchema = zod_1.z
    .union([exports.CreateOrderItemSchema, zod_1.z.array(exports.CreateOrderItemSchema).min(1)])
    .transform((val) => (Array.isArray(val) ? val : [val]));
