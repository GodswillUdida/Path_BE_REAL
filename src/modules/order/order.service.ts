import prisma from "../../lib/prisma";
import { CreateOrderDTO, CreateOrderSchema } from "./order.schema";
import { forbidden, notFound } from "../../utils/errors";

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
} as const;

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

export async function createOrder(
  dto: CreateOrderDTO,
  userId?: string,
) {
  // 1. Modern Zod validation (throws clear error + transforms if needed)
  const validatedDto = CreateOrderSchema.parse(dto);

  const { email, name, phone, items } = validatedDto;

  const pricingIds = items.map((item) => item.pricingId);

  const pricings = await prisma.coursePricing.findMany({
    where: {
      id: { in: pricingIds },
      isActive: true,
    },
    include: {
      course: { select: { id: true, title: true, slug: true } },
    },
  });

  if (pricings.length !== pricingIds.length) {
    throw notFound("Invalid pricing selected");
  }
  const pricingMap = new Map(pricings.map((p) => [p.id, p]));

  let totalAmount = 0;

  const orderItemsData = items.map((item) => {
    const pricing = pricingMap.get(item.pricingId)!;
    const qty = item.quantity ?? 1;
    const unitPrice = pricing.price;

    totalAmount += unitPrice * qty;

    return {
      pricingId: item.pricingId,
      unitPrice,
      quantity: qty,
    };
  });

  const order = await prisma.order.create({
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

export async function getUserOrders(userId: string) {
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
  if (order.userId !== userId)
    throw forbidden("Access denied — this is not your order");

  return order;
}
