"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreatePhysicalEnrollmentRequestSchema = exports.CreateEnrollmentSchema = void 0;
const zod_1 = require("zod");
exports.CreateEnrollmentSchema = zod_1.z.object({
    courseId: zod_1.z.uuid(),
    pricingId: zod_1.z.uuid(),
    programId: zod_1.z.uuid().optional(),
    orderId: zod_1.z.uuid().optional(),
});
exports.CreatePhysicalEnrollmentRequestSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    email: zod_1.z.email(),
    phone: zod_1.z.string().min(10),
    programId: zod_1.z.uuid().optional(),
    courseId: zod_1.z.uuid().optional(),
    notes: zod_1.z.string().optional(),
    source: zod_1.z.string().optional(),
    metadata: zod_1.z.any().optional(),
});
