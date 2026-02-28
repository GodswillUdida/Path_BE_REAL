// // src/modules/order/order.service.ts
// import prisma from "../../lib/prisma";
// import { CreateOrderDTO } from "./order.schema";
// import { notFound, forbidden, unauthorized } from "../../utils/errors";
// // import { createCheckout } from "../../lib/paymentProvider";
// import { initiatePaystackPayment } from "../../modules/payment/payment.service";

// export async function createOrderService(userId: string, dto: CreateOrderDTO) {
//   const { enrollmentIds, currency } = dto;

//   // fetch enrollments & validate ownership + pending
//   const enrollments = await prisma.enrollment.findMany({
//     where: { id: { in: enrollmentIds } },
//     include: { pricing: true, course: true },
//   });

//   if (enrollments.length !== enrollmentIds.length)
//     throw notFound("One or more enrollments not found");

//   for (const e of enrollments) {
//     if (e.userId !== userId)
//       throw forbidden("Cannot create order for enrollments that are not yours");
//     if (e.paymentStatus === "PAID")
//       throw forbidden(`Enrollment already paid for course ${e.course.title}`);
//   }

//   const amount = enrollments.reduce(
//     (acc, e) => acc + Number(e.pricing.price),
//     0
//   );

//   // Create order
//   const order = await prisma.order.create({
//     data: {
//       userId,
//       totalAmount,
//       // amount: totalA,
//       currency: currency ?? "NGN",
//       status: "PENDING",
//       enrollments: {
//         connect: enrollmentIds.map((id) => ({ id })),
//       },
//     },
//   });

//   // attach enrollments to order in transaction and update enrollments.orderId
//   await prisma.$transaction([
//     prisma.enrollment.updateMany({
//       where: { id: { in: enrollmentIds } },
//       data: { orderId: order.id },
//     }),
//   ]);

//   // Create payment intent with provider
//   // const callbackUrl = `${process.env.BASE_URL}/api/payment/webhook`; // provider should call this
//   const { reference, paymentLink } = await initiatePaystackPayment(order.id);

//   // Create a Payment record for the order with status PENDING and provider reference
//   await prisma.payment.create({
//     data: {
//       userId,
//       orderId: order.id,
//       reference,
//       amount,
//       currency: currency ?? "NGN",
//       status: "PENDING",
//       gateway: "paystack",
//       metadata: { orderId: order.id },
//     },
//   });

//   // return order + payment link
//   return {
//     orderId: order.id,
//     amount,
//     currency: currency ?? "NGN",
//     paymentLink: paymentLink,
//     reference,
//   };
// }

// export async function getOrderService(userId: string, orderId: string) {
//   const order = await prisma.order.findUnique({
//     where: { id: orderId },
//     include: {
//       payments: true,
//       enrollments: { include: { course: true, pricing: true } },
//     },
//   });
//   if (!order) throw notFound("Order not found");
//   if (order.userId !== userId) throw unauthorized("Unauthorized order access");
//   return order;
// }


// order.service.ts
// Rewritten & Enhanced — February 2026
// Senior Engineer @ modern TypeScript/Prisma stack
// Fully aligned with enrollment.service.ts
// • Atomic order + items creation
// • Pre-validation + total calculation
// • Returns orderItem.id ready for createEnrollmentsService
// • Rich includes for frontend (course titles, linked enrollments)

import prisma from "../../lib/prisma";
import { CreateOrderItemDTO } from "./order.schema";
import { forbidden, notFound } from "../../utils/errors";

const orderIncludes = {
  user: { select: { id: true, name: true, email: true } },
  items: {
    include: {
      pricing: {
        include: {
          course: {
            select: { id: true, title: true },
          },
        },
      },
    },
  },
  payments: true,
  enrollments: {
    include: {
      course: { select: { id: true, title: true } },
      pricing: true,
    },
  },
} as const;

/**
 * Create order (single or bulk items)
 * - Validates all pricings exist
 * - Calculates totalAmount atomically
 * - Nested creation of Order + OrderItems
 * - Returns order with .items[].id → use directly as orderItemId in enrollment
 */
export async function createOrderService(
  userId: string,
  data: CreateOrderItemDTO[]
) {
  if (!data?.length) throw forbidden("No items provided");

  const pricingIds = [...new Set(data.map((i) => i.pricingId))];

  const pricings = await prisma.coursePricing.findMany({
    where: { id: { in: pricingIds } },
  });

  const pricingMap = new Map(pricings.map((p) => [p.id, p]));

  let totalAmount = 0;
  const itemsToCreate = data.map((item) => {
    const pricing = pricingMap.get(item.pricingId);
    if (!pricing) throw notFound(`Pricing ${item.pricingId} not found`);

    const quantity = item.quantity ?? 1;
    totalAmount += pricing.price * quantity;

    return {
      pricingId: item.pricingId,
      price: pricing.price, // unit price
      quantity,
    };
  });

  const order = await prisma.order.create({
    data: {
      userId,
      totalAmount,
      currency: "NGN",
      status: "PENDING",
      items: {
        create: itemsToCreate,
      },
    },
    include: orderIncludes,
  });

  return order;
}

export async function getUserOrdersService(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: orderIncludes,
    orderBy: { createdAt: "desc" },
  });
}

export async function getOneOrderService(id: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: orderIncludes,
  });

  if (!order) throw notFound("Order not found");
  if (order.userId !== userId) throw forbidden("Access denied — this is not your order");

  return order;
}