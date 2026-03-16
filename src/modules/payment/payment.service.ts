import axios from "axios";
import prisma from "../../lib/prisma";
import logger from "../../utils/logger";
import { AppError } from "../../middleware/error";
import { verifyPaystackSignature } from "../../lib/paymentProvider";
import {
  sendConfirmationEmail,
  sendAdminNotification,
} from "../../services/emailService";
import { badRequest, notFound, unauthorized } from "../../utils/errors";
import { Prisma } from "@prisma/client";

interface PaystackInitResponse {
  status: boolean;
  message: string;
  data: { authorization_url: string; access_code: string; reference: string };
}

interface VerifyResponse {
  success: boolean;
  status: string;
  data?: any;
}

// ─────────────────────────────────────────────────────────────
// 1. Initiate Payment (updated callback for new success page)
// ─────────────────────────────────────────────────────────────
export const initiatePaystackPayment = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { email: true } },
      items: {
        include: {
          pricing: { include: { course: { select: { title: true } } } },
        },
      },
    },
  });

  if (!order) throw notFound("Order not found");
  if (order.status !== "PENDING") throw badRequest("Order is not pending");

  const email = order.user?.email || order.email;
  const reference = `order_${order.id}_${Date.now()}`;

  const payload = {
    reference,
    email,
    amount: Math.round(order.totalAmount * 100),
    currency: order.currency,
    callback_url: `${process.env.FRONTEND_URL}/checkout/success?reference=${reference}`,
    metadata: {
      orderId: order.id,
      courses: order.items.map((i) => ({
        courseId: i.pricing.courseId,
        title: i.pricing.course.title,
      })),
    },
  };

  const { data: response } = await axios.post<PaystackInitResponse>(
    "https://api.paystack.co/transaction/initialize",
    payload,
    {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      timeout: 10000,
    },
  );

  if (!response.status)
    throw new AppError(response.message || "Paystack init failed", 500);

  await prisma.payment.upsert({
    where: { reference },
    update: {},
    create: {
      userId: order.userId ?? null,
      orderId: order.id,
      reference,
      amount: order.totalAmount,
      currency: order.currency,
      gateway: "paystack",
      status: "PENDING",
      metadata: payload.metadata,
    },
  });

  return { paymentLink: response.data.authorization_url, reference };
};

// ─────────────────────────────────────────────────────────────
// 2. Lightweight Verify (for frontend success page)
// ─────────────────────────────────────────────────────────────
export const verifyPayment = async (
  reference: string,
): Promise<VerifyResponse> => {
  const { data } = await axios.get(
    `https://api.paystack.co/transaction/verify/${reference}`,
    {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    },
  );

  const payment = await prisma.payment.findUnique({ where: { reference } });

  return {
    success: data.status && data.data.status === "success",
    status: data.data.status,
    data: { payment, paystack: data.data },
  };
};

// ─────────────────────────────────────────────────────────────
// 3. Webhook – SINGLE source of truth (fulfillment + guest user)
// ─────────────────────────────────────────────────────────────
export const processPaymentWebhook = async (
  rawBody: string,
  signature: string | undefined,
) => {
  if (!verifyPaystackSignature(rawBody, signature))
    throw unauthorized("Invalid signature");

  const payload = JSON.parse(rawBody);
  if (payload.event !== "charge.success") return { received: true };

  const { reference, amount } = payload.data;

  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: { order: true },
  });

  if (!payment || payment.status === "PAID") return { received: true };
  if (amount !== Math.round(payment.amount * 100))
    throw badRequest("Amount mismatch");

  await prisma.$transaction(async (tx) => {
    let userId = payment.userId;

    // Create guest user if needed
    if (!userId) {
      const order = await tx.order.findUnique({
        where: { id: payment.orderId! },
      });
      const newUser = await tx.user.create({
        data: {
          email: order!.email,
          name: order!.name || "Student",
          phone: order!.phone,
          password: generateRandomPassword(),
        },
      });

      await tx.order.update({
        where: { id: order!.id },
        data: { userId: newUser.id },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { userId: newUser.id },
      });
      userId = newUser.id;
    }

    // Mark paid
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        metadata: {
          ...(payment.metadata as any),
          providerPayload: payload.data,
        },
      },
    });
    await tx.order.update({
      where: { id: payment.orderId! },
      data: { status: "PAID" },
    });

    // Fulfill (enrollments + progress)
    await fulfillOrderAfterPayment(tx, payment.orderId!, userId, reference);
  });

  // Fire-and-forget notifications
  sendPostPaymentNotifications(payment.orderId!, reference).catch((err) =>
    logger.error("Notification failed", err),
  );

  logger.info("Payment fulfilled", { reference, orderId: payment.orderId });
  return { received: true };
};

// ─────────────────────────────────────────────────────────────
// Internal helpers (unchanged but cleaner)
// ─────────────────────────────────────────────────────────────
async function fulfillOrderAfterPayment(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId: string,
  reference: string,
) {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: { pricing: true },
  });

  const enrollments = await Promise.all(
    items.map((item) =>
      tx.enrollment.create({
        data: {
          userId,
          courseId: item.pricing.courseId,
          pricingId: item.pricingId,
          orderItemId: item.id,
          orderId,
          paymentStatus: "PAID",
          paymentRef: reference,
          startedAt: new Date(),
          expiresAt: new Date(
            Date.now() + item.pricing.durationDays * 86_400_000,
          ),
        },
      }),
    ),
  );

  await initializeProgressForEnrollments(tx, enrollments);
}

async function initializeProgressForEnrollments(
  tx: Prisma.TransactionClient,
  enrollments: any[],
) {
  for (const e of enrollments) {
    const firstTopic = await tx.course
      .findUnique({
        where: { id: e.courseId },
        select: {
          modules: {
            take: 1,
            orderBy: { position: "asc" },
            include: { topics: { take: 1, orderBy: { position: "asc" } } },
          },
        },
      })
      .then((c) => c?.modules[0]?.topics[0]);

    if (firstTopic) {
      await tx.progress.create({
        data: { enrollmentId: e.id, topicId: firstTopic.id, completed: false },
      });
    }
  }
}

// ------------------- Email Notifications -------------------
async function sendPostPaymentNotifications(
  orderId: string,
  reference: string,
) {
  const enrollments = await prisma.enrollment.findMany({
    where: { orderId },
    include: {
      user: { select: { email: true, name: true } },
      course: { select: { title: true } },
      pricing: { select: { price: true } },
    },
  });

  await Promise.allSettled(
    enrollments.map(async (enrollment) => {
      if (!enrollment.user?.email) return;

      await Promise.allSettled([
        sendConfirmationEmail(enrollment.user.email, {
          name: enrollment.user.name ?? "Student",
          courseName: enrollment.course.title,
          enrollmentId: enrollment.id,
          orderId,
          amount: enrollment.pricing.price,
          currency: "NGN",
        }),
        sendAdminNotification({
          subject: "New Paid Order",
          orderId,
          amount: enrollment.pricing.price,
          reference,
          userId: enrollment.userId,
        }),
      ]);
    }),
  );
}

// ------------------- Utilities -------------------
function generateRandomPassword(length = 24) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}
