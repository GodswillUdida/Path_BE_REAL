import prisma from "../../lib/prisma";
import { CreateOrderDTO, CreateOrderSchema } from "./order.schema";
import { badRequest, forbidden, notFound } from "../../utils/errors";

const orderIncludes = {
  items: {
    include: {
      pricing: { include: { course: { select: { id: true, title: true } } } },
    },
  },
  user: { select: { id: true, email: true, name: true } },
  enrollments: true,
} as const;

export async function createOrder(
  dto: CreateOrderDTO,
  userId: string,
) {
  // 1. Modern Zod validation (throws clear error + transforms if needed)
  const validatedDto = CreateOrderSchema.parse(dto);

  if (!userId) throw badRequest("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user?.email) throw badRequest("User profile incomplete");


  const pricingIds = validatedDto.items.map((item) => item.pricingId);

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

  let totalAmountKobo  = 0;

  const orderItemsData = validatedDto.items.map((item) => {
    const pricing = pricingMap.get(item.pricingId)!;
    const qty = item.quantity ?? 1;

    // 🔥 FIX: store money as integer (kobo)
    // const unitPrice = Number(pricing.price);
    const unitPriceKobo = Math.round(Number(pricing.price) * 100);

    totalAmountKobo  += unitPriceKobo * qty;

    return {
      pricingId: item.pricingId,
      unitPrice: unitPriceKobo,
      quantity: qty,
    };
  });

  const order = await prisma.order.create({
    data: {
      userId,
      email: user.email,
      name: user.name,
      phone: validatedDto.phone,
      totalAmount: totalAmountKobo,
      currency: "NGN",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
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
