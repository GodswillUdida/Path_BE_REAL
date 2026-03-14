"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrder = createOrder;
exports.getUserOrders = getUserOrders;
exports.getOneOrderService = getOneOrderService;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const order_schema_1 = require("./order.schema");
const errors_1 = require("../../utils/errors");
// const orderIncludes = {
//   user: { select: { id: true, name: true, email: true } },
//   items: {
//     include: {
//       pricing: {
//         include: {
//           course: {
//             select: { id: true, title: true },
//           },
//         },
//       },
//     },
//   },
//   payments: true,
//   enrollments: {
//     include: {
//       course: { select: { id: true, title: true } },
//       pricing: true,
//     },
//   },
// } as const;
const orderIncludes = {
    items: {
        include: {
            pricing: { include: { course: { select: { id: true, title: true } } } },
        },
    },
    user: { select: { id: true, email: true, name: true } },
    enrollments: true,
};
// export async function createOrderService(
//   userId: string,
//   data: CreateOrderDTO
// ) {
//   if (!data?.length) throw forbidden("No items provided");
//   const pricingIds = [...new Set(data.map((i) => i.pricingId))];
//   const pricings = await prisma.coursePricing.findMany({
//     where: { id: { in: pricingIds } },
//   });
//   const pricingMap = new Map(pricings.map((p) => [p.id, p]));
//   let totalAmount = 0;
//   const itemsToCreate = data.map((item) => {
//     const pricing = pricingMap.get(item.pricingId);
//     if (!pricing) throw notFound(`Pricing ${item.pricingId} not found`);
//     const quantity = item.quantity ?? 1;
//     totalAmount += pricing.price * quantity;
//     return {
//       pricingId: item.pricingId,
//       price: pricing.price, // unit price
//       quantity,
//     };
//   });
//   const order = await prisma.order.create({
//     data: {
//       userId,
//       totalAmount,
//       currency: "NGN",
//       status: "PENDING",
//       items: {
//         create: itemsToCreate,
//       },
//     },
//     include: orderIncludes,
//   });
//   return order;
// }
// export async function createOrderAndEnrollments(
//   userId: string,
//   dto: CreateOrderDTO,
// ) {
//   // 1. Validate all pricings exist + calculate total
//   const pricingIds = dto.map((item) => item.pricingId);
//   const pricings = await prisma.coursePricing.findMany({
//     where: { id: { in: pricingIds }, isActive: true },
//     include: { course: { select: { id: true, title: true } } },
//   });
//   if (pricings.length !== pricingIds.length) {
//     throw notFound("One or more pricing plans not found or inactive");
//   }
//   const pricingMap = new Map(pricings.map((p) => [p.id, p]));
//   let totalAmount = 0;
//   const orderItemsData = dto.map((item) => {
//     const pricing = pricingMap.get(item.pricingId)!;
//     const qty = item.quantity ?? 1;
//     totalAmount += pricing.price * qty;
//     return {
//       pricingId: item.pricingId,
//       price: pricing.price, // snapshot
//       quantity: qty,
//     };
//   });
//   // 2. Atomic transaction: Order → OrderItems → Enrollments
//   return prisma.$transaction(async (tx) => {
//     // Create Order + OrderItems
//     const order = await tx.order.create({
//       data: {
//         userId,
//         totalAmount,
//         currency: "NGN",
//         status: "PENDING",
//         items: { create: orderItemsData },
//       },
//       include: { items: true },
//     });
//     // Create Enrollments for each item
//     // const enrollments = await Promise.all(
//     //   order.items.map(async (item) => {
//     //     const pricing = pricingMap.get(item.pricingId)!;
//     //     return tx.enrollment.create({
//     //       data: {
//     //         userId,
//     //         courseId: pricing.courseId,
//     //         pricingId: item.pricingId,
//     //         orderItemId: item.id,
//     //         orderId: order.id,
//     //         paymentStatus: "PENDING",
//     //         expiresAt: new Date(
//     //           Date.now() + pricing.durationDays * 24 * 60 * 60 * 1000,
//     //         ),
//     //       },
//     //     });
//     //   }),
//     // );
//     // Return enriched order
//     return tx.order.findUnique({
//       where: { id: order.id },
//       include: orderIncludes,
//     });
//   });
// }
async function createOrder(dto, userId) {
    // 1. Modern Zod validation (throws clear error + transforms if needed)
    const validatedDto = order_schema_1.CreateOrderSchema.parse(dto);
    const { email, name, phone, items } = validatedDto;
    const pricingIds = items.map((item) => item.pricingId);
    const pricings = await prisma_1.default.coursePricing.findMany({
        where: {
            id: { in: pricingIds },
            isActive: true,
        },
        include: {
            course: { select: { id: true, title: true, slug: true } },
        },
    });
    if (pricings.length !== pricingIds.length) {
        throw (0, errors_1.notFound)("Invalid pricing selected");
    }
    const pricingMap = new Map(pricings.map((p) => [p.id, p]));
    let totalAmount = 0;
    const orderItemsData = items.map((item) => {
        const pricing = pricingMap.get(item.pricingId);
        const qty = item.quantity ?? 1;
        const unitPrice = pricing.price;
        totalAmount += unitPrice * qty;
        return {
            pricingId: item.pricingId,
            unitPrice,
            quantity: qty,
        };
    });
    const order = await prisma_1.default.order.create({
        data: {
            userId: userId ?? null,
            email,
            name,
            phone,
            totalAmount,
            currency: "NGN",
            items: {
                create: orderItemsData,
            },
        },
        include: {
            items: {
                include: {
                    pricing: {
                        include: {
                            course: true,
                        },
                    },
                },
            },
        },
    });
    return order;
}
async function getUserOrders(userId) {
    return prisma_1.default.order.findMany({
        where: { userId },
        include: orderIncludes,
        orderBy: { createdAt: "desc" },
    });
}
async function getOneOrderService(id, userId) {
    const order = await prisma_1.default.order.findUnique({
        where: { id },
        include: orderIncludes,
    });
    if (!order)
        throw (0, errors_1.notFound)("Order not found");
    if (order.userId !== userId)
        throw (0, errors_1.forbidden)("Access denied — this is not your order");
    return order;
}
