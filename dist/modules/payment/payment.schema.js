"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InitializePaymentSchema = void 0;
// src/modules/payment/payment.schema.ts
const zod_1 = require("zod");
exports.InitializePaymentSchema = zod_1.z.object({
    orderId: zod_1.z.string().uuid("Invalid order ID"),
});
