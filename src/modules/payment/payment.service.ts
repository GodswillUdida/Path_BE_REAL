import axios from "axios";
import prisma from "../../lib/prisma";
import logger from "../../utils/logger";
import { AppError } from "../../middleware/error";
import { verifyWebhookSignature } from "../../lib/paymentProvider";
import {
  sendConfirmationEmail,
  sendAdminNotification,
} from "../../services/emailService";

interface PaystackInitResponse {
  data: {
    authorization_url: string;
    reference: string;
  };
}

// -------------------------------------------------------------
// 1. INITIATE PAYMENT (Paystack)
// -------------------------------------------------------------
export const initiatePaystackPayment = async (orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  });

  if (!order) throw new AppError("Order not found", 404);

  try {
    const response = await axios.post<PaystackInitResponse>(
      "https://api.paystack.co/transaction/initialize",
      {
        reference: order.id,
        email: order.user.email,
        currency: order.currency,
        amount: order.amount * 100,
        callback_url: `${process.env.FRONTEND_URL}/payment/processing?reference=${order.id}`,
        metadata: {
          orderId: order.id,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { authorization_url, reference } = response.data.data;

    return {
      paymentLink: authorization_url,
      reference,
    };
  } catch (err: any) {
    logger.error(
      `❌ Paystack payment initiation failed → ${
        err.response?.data?.message || err.message
      }`
    );
    throw new AppError("Failed to initiate payment", 500);
  }
};

// -------------------------------------------------------------
// 2. PROCESS WEBHOOK
// -------------------------------------------------------------
export const processPaymentWebhook = async (
  rawBody: string,
  headers: Record<string, string | undefined>
) => {
  const signature =
    headers["x-paystack-signature"] ||
    headers["x-flw-signature"] ||
    headers["paystack-signature"];

  if (!verifyWebhookSignature(rawBody, signature)) {
    throw new Error("Invalid webhook signature");
  }

  const payload = JSON.parse(rawBody);
  const event = payload.event || payload.type;
  const data = payload.data || payload;

  const reference = data.reference;
  if (!reference) throw new Error("No reference in webhook");

  // Fetch Payment
  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment) {
    logger.warn("Payment not found for webhook reference →", { reference });
    return { ok: true };
  }

  const orderId = (payment.metadata as any)?.orderId;

  const succeeded =
    event === "charge.success" ||
    data.status === "success" ||
    data.paid === true ||
    event === "transaction.success";

  // -----------------------------------------------------------
  // FAILED PAYMENT
  // -----------------------------------------------------------
  if (!succeeded) {
    const updates: any[] = [
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          metadata: {
            ...(typeof payment.metadata === "object" &&
            payment.metadata !== null
              ? payment.metadata
              : {}),
            providerPayload: data,
          },
        },
      }),
    ];

    if (orderId) {
      updates.push(
        prisma.order.update({
          where: { id: orderId },
          data: { status: "FAILED" },
        })
      );
    }

    await prisma.$transaction(updates);

    return { ok: true };
  }
  // -----------------------------------------------------------
  // SUCCESSFUL PAYMENT
  // -----------------------------------------------------------
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "PAID",
      metadata: {
        ...(typeof payment.metadata === "object" && payment.metadata !== null
          ? payment.metadata
          : {}),
        providerPayload: data,
      },
    },
  });

  // Mark Order as PAID
  // const orderId = (payment.metadata as any)?.orderId;
  // if (orderId) {

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "PAID" },
  });

  // }

  // Update Enrollments linked to this Order
  const enrollments = await prisma.enrollment.findMany({ where: { orderId } });

  await prisma.$transaction(
    enrollments.map((e) =>
      prisma.enrollment.update({
        where: { id: e.id },
        data: {
          paymentStatus: "PAID",
          paymentRef: reference,
          startedAt: new Date(),
        },
      })
    )
  );

  // Send confirmation emails
  for (const e of enrollments) {
    const user = await prisma.user.findUnique({ where: { id: e.userId } });
    const course = await prisma.course.findUnique({
      where: { id: e.courseId },
    });

    if (user && course) {
      try {
        await sendConfirmationEmail(user.email, {
          name: user.name,
          email: user.email,
          courseName: course.title,
          courseDuration: String(course.duration ?? ""),
          enrollmentId: e.id,
          url: `${process.env.FRONTEND_URL}/dashboard`,
        } as any);
      } catch (err) {
        logger.warn("Confirmation email failed →", err);
      }
    }
  }

  // Admin notification
  try {
    // const userEmail = payment.userId
    //   ? (await prisma.user.findUnique({ where: { id: payment.userId } }))?.email
    //   : undefined;

    const usr = await prisma.user.findUnique({
      where: { id: payment.userId },
    });

    await sendAdminNotification({
      name: "Order Payment Received",
      email: usr?.email,
      enrollmentId: enrollments.map((x) => x.id).join(","),
    } as any);
  } catch {}

  return { ok: true };
};
