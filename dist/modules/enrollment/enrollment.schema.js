"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateEnrollmentSchema = void 0;
const zod_1 = require("zod");
exports.CreateEnrollmentSchema = zod_1.z.object({
    courseId: zod_1.z.uuid(),
    pricingId: zod_1.z.uuid(),
    programId: zod_1.z.uuid().optional(),
    orderItemId: zod_1.z.uuid().optional(),
    // orderId: z.uuid().optional(),
});
// export type CreatePhysicalEnrollmentRequestInput = z.infer<
//   typeof CreatePhysicalEnrollmentRequestSchema
// >;
