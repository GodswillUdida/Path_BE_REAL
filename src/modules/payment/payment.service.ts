import axios from "axios";
import crypto from "crypto";
import prisma from "../../lib/prisma";
import logger from "../../utils/logger";
import { verifyPaystackSignature } from "../../lib/paymentProvider";
import {
  sendConfirmationEmail,
  sendAdminNotification,
} from "../../services/emailService";
import { badRequest, notFound, unauthorized } from "../../utils/errors";
import { Prisma } from "@prisma/client";
import { hashPassword } from "../../utils/hash";
import { InitializePaymentDTO } from "./payment.schema";
import * as authService from "../auth/auth.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaystackInitResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyData {
  status: string;
  amount: number; // kobo
  reference: string;
  customer: { email: string };
  metadata: { orderId: string };
}

/** Shape the frontend success page expects from GET /payments/verify */
export interface VerifyPaymentResult {
  success: boolean;
  status: "success" | "pending" | "failed";
  /**
   * One-time magic login token. Only present when:
   *  - payment.status === "success"
   *  - the payer was a guest (no prior session)
   * The frontend POSTs this to /auth/magic-login/verify to auto-login.
   */
  magicToken?: string;
  email?: string;
}

/** Shape the frontend checkout page expects from POST /payments/paystack/initialize */
export interface InitiatePaymentResult {
  data: {
    paymentLink: string;
    reference: string;
  };
}

// ---------------------------------------------------------------------------
// Paystack HTTP client (shared config, single place to update)
// ---------------------------------------------------------------------------

const paystackHttp = axios.create({
  baseURL: "https://api.paystack.co",
  timeout: 12_000,
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

export const createOrderAndInitiatePayment = async (
  dto: InitializePaymentDTO,
  userId: string | null,
): Promise<InitiatePaymentResult> => {
  const { email, name, phone, items } = dto;

  // Fetch all pricing records in one query
  const pricingIds = items.map((i) => i.pricingId);
  const pricings = await prisma.coursePricing.findMany({
    where: { id: { in: pricingIds } },
    select: { id: true, price: true, courseId: true, durationDays: true },
  });

  // Validate every requested pricingId exists
  if (pricings.length !== pricingIds.length) {
    const foundIds = new Set(pricings.map((p) => p.id));
    const missing = pricingIds.filter((id) => !foundIds.has(id));
    throw badRequest(`Invalid pricing IDs: ${missing.join(", ")}`);
  }

  const pricingMap = new Map(pricings.map((p) => [p.id, p]));

  const totalAmount = items.reduce((sum, item) => {
    return sum + Number(pricingMap.get(item.pricingId)!.price) * item.quantity;
  }, 0);

  const order = await prisma.$transaction(async (tx) => {
    return tx.order.create({
      data: {
        userId,
        email,
        name,
        phone,
        totalAmount,
        currency: "NGN",
        status: "PENDING",
        items: {
          create: items.map((item) => ({
            pricingId: item.pricingId,
            unitPrice: Number(pricingMap.get(item.pricingId)!.price),
            quantity: item.quantity,
          })),
        },
      },
    });
  });

  return initiatePaystackPayment(order.id);
};

// ---------------------------------------------------------------------------
// 2. Initiate Paystack for an existing order
// ---------------------------------------------------------------------------

const initiatePaystackPayment = async (
  orderId: string,
): Promise<InitiatePaymentResult> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { email: true } },
      items: {
        include: {
          pricing: {
            include: { course: { select: { id: true, title: true } } },
          },
        },
      },
    },
  });

  if (!order) throw notFound("Order not found");
  if (order.status !== "PENDING") throw badRequest("Order is not pending");

  const email = order.user?.email ?? order.email;
  if (!email) throw badRequest("No email associated with this order");

  const reference = `pay_${crypto.randomBytes(12).toString("hex")}`;

  const paystackPayload = {
    reference,
    email,
    amount: Math.round(Number(order.totalAmount) * 100), // kobo
    currency: order.currency,
    callback_url: `${process.env.FRONTEND_URL}/checkout/success?reference=${reference}`,
    metadata: {
      orderId: order.id,
      courses: order.items.map((i) => ({
        courseId: i.pricing.course.id,
        title: i.pricing.course.title,
      })),
    },
  };

  const { data: response } = await paystackHttp.post<PaystackInitResponse>(
    "/transaction/initialize",
    paystackPayload,
  );

  if (!response.status) {
    throw new Error("Failed to initiate payment: " + response.message);
  }

  await prisma.payment.create({
    data: {
      userId: order.userId ?? null,
      orderId: order.id,
      reference,
      amount: order.totalAmount,
      currency: order.currency,
      gateway: "paystack",
      status: "PENDING",
      metadata: paystackPayload.metadata as Prisma.InputJsonValue,
    },
  });

  return {
    data: {
      paymentLink: response.data.authorization_url,
      reference,
    },
  };
};

export const verifyPayment = async (
  reference: string,
): Promise<VerifyPaymentResult> => {
  // FIX (perf + security): check local DB first.
  // If we already recorded PAID, return immediately — no Paystack round-trip,
  // no exposure of a live Paystack endpoint to unauthenticated polling.
  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: {
      order: {
        select:
        {
          email: true,
          userId: true
        }
      },
    },
  });

  if (!payment) {
    // Unknown reference — return a safe 404-style response (don't reveal
    // whether references exist or not to anonymous callers).
    return { success: false, status: "failed" };
  }

  // If the webhook already processed this, we can answer immediately.
  if (payment.status === "PAID") {
    return buildVerifyResult(payment, "success");
  }

  // Still pending — poll Paystack once to get the latest status.
  // FIX (design): added timeout via shared paystackHttp instance.
  const { data } = await paystackHttp.get<{
    status: boolean;
    data: PaystackVerifyData;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);

  const paystackStatus = data.data.status as "success" | "pending" | "failed";

  // FIX (bug): do NOT do fulfillment here. The webhook is the source of truth.
  // This endpoint only reports status. Fulfillment via verifyPayment is fragile
  // because it may race the webhook or be called multiple times by the user
  // refreshing the success page.

  return buildVerifyResult(
    payment,
    data.data.status as "success" | "pending" | "failed",
  );
};

/**
 * Constructs the verify response.
 * For guest users on a successful payment, we issue a one-time magic token
 * so the success page can auto-login without requiring a password.
 */
async function buildVerifyResult(
  payment: {
    id: string;
    userId: string | null;
    order: { email: string | null; userId: string | null } | null;
  },
  paystackStatus: "success" | "pending" | "failed",
): Promise<VerifyPaymentResult> {


  const isSuccess = paystackStatus === "success";
  // const userId = payment.userId ?? payment.order?.userId ?? null;
  // const email = payment.order?.email ?? null;

  // const wasGuest = !payment.order?.userId;
  const wasGuest = !payment.userId;
  const email = payment.order?.email ?? null;

  if (isSuccess && wasGuest && email) {
    const { token } = await authService.createMagicLoginToken(email);

    return { success: true, status: "success", magicToken: token, email };
  }
  return { success: isSuccess, status: paystackStatus };
}

// ---------------------------------------------------------------------------
// 3. Webhook — single source of truth for fulfillment
// ---------------------------------------------------------------------------

export const processPaymentWebhook = async (
  rawBody: string,
  signature: string | undefined,
): Promise<{ received: true }> => {
  if (!verifyPaystackSignature(rawBody, signature)) {
    throw unauthorized("Invalid webhook signature");
  }

  const payload = JSON.parse(rawBody);
  if (payload.event !== "charge.success") return { received: true };

  const { reference, amount: amountKobo } = payload.data as PaystackVerifyData;

  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: { order: true },
  });

  // FIX (idempotency): a duplicate webhook delivery must be silently swallowed.
  if (!payment || payment.status === "PAID") return { received: true };

  // FIX (bug): payment.amount is a Prisma Decimal — coerce to Number before
  // arithmetic. `"1500.00" * 100` evaluates to NaN in JS, making the guard
  // always pass silently.
  const expectedKobo = Math.round(Number(payment.amount) * 100);
  if (amountKobo !== expectedKobo) {
    logger.error("Amount mismatch on webhook", {
      reference,
      expected: expectedKobo,
      received: amountKobo,
    });
    throw badRequest("Amount mismatch");
  }

  await prisma.$transaction(async (tx) => {
    let userId = payment.userId;

    // Create guest user if this was a guest checkout
    if (!userId) {
      const order = payment.order!;

      if (!order.email) {
        throw new Error("Guest checkout without email is not supported");
      }

      // FIX (security + auth): guest users need a hashed random password
      // and emailVerified: true so they can receive magic links and log in.
      // FIX (race condition): use upsert instead of create to handle the case
      // where a duplicate webhook fires before the first transaction commits.
      const guestUser = await tx.user.upsert({
        where: { email: order.email },
        update: {}, // already exists — don't overwrite anything
        create: {
          email: order.email,
          name: order.name ?? order.email.split("@")[0],
          accounts: {
            create: {
              provider: "credentials",
              providerId: order.email,
              password: await hashPassword(crypto.randomBytes(32).toString("hex")),
            },
          },
          phone: order.phone ?? null,
          emailVerified: true, // verified via OTP during checkout
          provider: "checkout"
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { userId: guestUser.id },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { userId: guestUser.id },
      });

      userId = guestUser.id;
    }

    // Mark payment and order as paid
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAID",
        metadata: {
          ...(payment.metadata as Prisma.JsonObject),
          providerPayload: payload.data as Prisma.InputJsonValue,
        },
      },
    });

    await tx.order.update({
      where: { id: payment.orderId! },
      data: { status: "PAID" },
    });

    // Enroll the user in all purchased courses
    await fulfillOrder(tx, payment.orderId!, userId, reference);
  });

  // Non-blocking — failure here does not roll back the payment
  sendPostPaymentNotifications(payment.orderId!, reference).catch((err) =>
    logger.error("Post-payment notification failed: %o", err),
  );

  logger.info("Payment fulfilled", { reference, orderId: payment.orderId });
  return { received: true };
};

// ---------------------------------------------------------------------------
// Internal: fulfillment
// ---------------------------------------------------------------------------

async function fulfillOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId: string,
  reference: string,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: { pricing: { select: { courseId: true, durationDays: true } } },
  });

  if (items.length === 0) {
    logger.warn("fulfillOrder called with no items", { orderId });
    return;
  }

  // FIX (idempotency): skipDuplicates means retried webhooks are safe —
  // if enrollments already exist they are silently skipped.
  // FIX (perf): single createMany instead of Promise.all of individual creates.
  const now = new Date();
  const enrollmentData = items.map((item) => ({
    userId,
    courseId: item.pricing.courseId,
    pricingId: item.pricingId,
    orderItemId: item.id,
    orderId,
    paymentStatus: "PAID" as const,
    paymentRef: reference,
    startedAt: now,
    expiresAt: new Date(now.getTime() + item.pricing.durationDays * 86_400_000),
  }));

  await tx.enrollment.createMany({
    data: enrollmentData,
    skipDuplicates: true,
  });

  // Fetch newly created enrollments (we need their IDs for progress init)
  const enrollments = await tx.enrollment.findMany({
    where: { orderId, userId },
    select: { id: true, courseId: true },
  });

  await initializeProgress(tx, enrollments);
}

/**
 * FIX (perf): replaced N+1 serial loop with two batched queries:
 *  1. findMany to get all first topics across all courses in one round-trip
 *  2. createMany to insert all progress rows in one statement
 */
async function initializeProgress(
  tx: Prisma.TransactionClient,
  enrollments: { id: string; courseId: string }[],
): Promise<void> {
  if (enrollments.length === 0) return;

  const courseIds = enrollments.map((e) => e.courseId);

  // Fetch the first topic for each course in one query
  const courses = await tx.course.findMany({
    where: { id: { in: courseIds } },
    select: {
      id: true,
      modules: {
        take: 1,
        orderBy: { position: "asc" },
        select: {
          topics: {
            take: 1,
            orderBy: { position: "asc" },
            select: { id: true },
          },
        },
      },
    },
  });

  // Build a courseId → firstTopicId map
  const firstTopicByCourse = new Map(
    courses
      .map((c) => [c.id, c.modules[0]?.topics[0]?.id] as const)
      .filter(([, topicId]) => topicId !== undefined),
  );

  const progressRows = enrollments
    .filter((e) => firstTopicByCourse.has(e.courseId))
    .map((e) => ({
      enrollmentId: e.id,
      topicId: firstTopicByCourse.get(e.courseId)!,
      completed: false,
    }));

  if (progressRows.length > 0) {
    await tx.progress.createMany({ data: progressRows, skipDuplicates: true });
  }
}

// ---------------------------------------------------------------------------
// Internal: notifications
// ---------------------------------------------------------------------------

async function sendPostPaymentNotifications(
  orderId: string,
  reference: string,
): Promise<void> {
  const enrollments = await prisma.enrollment.findMany({
    where: { orderId },
    include: {
      user: { select: { email: true, name: true, phone: true } }, // added phone
      course: { select: { title: true } },
      pricing: { select: { price: true, durationDays: true } }, // added durationDays
    },
  });

  // FIX (design): filter out enrollments with no email before constructing
  // the notification work, rather than bailing out per-item inside the map.
  const notifiable = enrollments.filter((e) => !!e.user?.email);

  await Promise.allSettled(
    notifiable.map((e) => {
      const studentName = e.user!.name ?? e.user!.email.split("@")[0];
      const studentEmail = e.user!.email;
      const studentPhone = e.user!.phone ?? "N/A"; // added phone with fallback
      const courseName = e.course.title;
      const coursePrice = Number(e.pricing.price).toLocaleString("en-NG");
      const courseDuration = `${e.pricing.durationDays} days`;

      return Promise.allSettled([
        // Confirmation to the student
        sendConfirmationEmail(studentEmail, {
          name: studentName,
          courseName,
          enrollmentId: e.id,
          orderId,
          amount: Number(e.pricing.price),
          currency: "NGN",
        }),

        // Admin notification — now passes every variable the template needs
        sendAdminNotification({
          name: studentName,
          email: studentEmail,
          phone: studentPhone,
          courseName,
          courseDuration,
          coursePrice,
          enrollmentId: e.id,
        }),
      ]);
    }),
  );
}
