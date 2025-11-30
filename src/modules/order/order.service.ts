// src/modules/order/order.service.ts
import prisma from "../../lib/prisma";
import { CreateOrderDTO } from "./order.schema";
import { notFound, forbidden } from "../../utils/errors";
import { createCheckout } from "../../lib/paymentProvider";

export async function createOrderService(userId: string, dto: CreateOrderDTO) {
  const { enrollmentIds, currency } = dto;

  // fetch enrollments & validate ownership + pending
  const enrollments = await prisma.enrollment.findMany({
    where: { id: { in: enrollmentIds } },
    include: { pricing: true, course: true },
  });

  if (enrollments.length !== enrollmentIds.length)
    throw notFound("One or more enrollments not found");

  for (const e of enrollments) {
    if (e.userId !== userId)
      throw forbidden("Cannot create order for enrollments that are not yours");
    if (e.paymentStatus !== "PENDING")
      throw forbidden(`Enrollment ${e.id} not in PENDING`);
  }

  const amount = enrollments.reduce(
    (acc, e) => acc + Number(e.pricing.price),
    0
  );

  // Create order
  const order = await prisma.order.create({
      data: {
          userId,
          amount,
          currency: currency ?? "NGN",
          status: "PENDING",
          enrollments: {
              connect: enrollmentIds.map((id) => ({ id })),
          },
      },
  });

  // attach enrollments to order in transaction and update enrollments.orderId
  await prisma.$transaction([
    prisma.enrollment.updateMany({
      where: { id: { in: enrollmentIds } },
      data: { orderId: order.id },
    }),
  ]);

  // Create payment intent with provider
  const callbackUrl = `${process.env.BASE_URL}/api/payment/webhook`; // provider should call this
  const { reference, paymentUrl } = await createCheckout({
    amount,
    currency: currency ?? "NGN",
    callbackUrl,
    metadata: { orderId: order.id, userId },
  });

  // Create a Payment record for the order with status PENDING and provider reference
  await prisma.payment.create({
    data: {
      userId,
      orderId: order.id,
      reference,
      amount,
      currency: currency ?? "NGN",
      status: "PENDING",
      gateway: process.env.PAYMENT_PROVIDER || "paystack",
      metadata: { orderId: order.id },
    },
  });

  // return order + payment link
  return {
    orderId: order.id,
    amount,
    currency: currency ?? "NGN",
    paymentLink: paymentUrl,
    reference,
  };
}

export async function getOrderService(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payments: true,
      enrollments: { include: { course: true, pricing: true } },
    },
  });
  if (!order) throw notFound("Order not found");
  if (order.userId !== userId) throw forbidden("Not allowed");
  return order;
}
