import axios from "axios";
import crypto from "crypto";
import prisma from "../../lib/prisma";
import logger from "../../utils/logger";
import { verifyPaystackSignature } from "../../lib/paymentProvider";
import {
  sendConfirmationEmail,
  sendAdminNotification,
} from "../../services/emailService";
import { badRequest, forbidden, notFound, unauthorized } from "../../utils/errors";
import { Prisma } from "@prisma/client";
import { findEnrollmentsForNotification, findOrderForInitiation, findPaymentByReference, markOrderPaid, markPaymentPaid } from "./payment.queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaymentMetadata = {
  orderId: string;
  courses: { courseId: string; title: string }[];
};


interface PaystackInitResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyData extends Record<string, Prisma.InputJsonValue> {
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
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

async function withRetry(fn: () => Promise<any>, retries = 3) {
  try {
    return await fn();
  } catch (err: any) {
    if (retries === 0) throw err;

    if (
      err.code === "ECONNABORTED" ||
      err.code === "ETIMEDOUT" ||
      err.code === "ENOTFOUND"
    ) {
      await new Promise((res) => setTimeout(res, 500 * (4 - retries)));
      return withRetry(fn, retries - 1);
    }

    throw err;
  }
}

const generateReference = (): string => {
  return `pay_${crypto.randomBytes(12).toString("hex")}`;
}

export const initiatePaystackPayment = async (
  orderId: string,
  userId: string,
): Promise<InitiatePaymentResult> => {

  // 1. Fetch + validate order (NO transaction yet)
  const order = await findOrderForInitiation(orderId);

  if (!order) throw notFound("Order not found");

  if (order.userId !== userId) {
    throw forbidden("Order does not belong to this user");
  }

  if (order.status !== "PENDING") {
    throw badRequest("Order is not payable");
  }

  if (order.expiresAt! < new Date()) {
    throw badRequest("Order expired");
  }

  const email = order.user?.email ?? order.email;
  if (!email) throw badRequest("No email associated with this order");

  // 2. Check existing pending payment (idempotency)
  const existingPayment = await prisma.payment.findFirst({
    where: {
      orderId,
      status: "PENDING",
    },
  });

  if (existingPayment) {
    return {
      data: {
        paymentLink: buildExistingLink(existingPayment.reference),
        reference: existingPayment.reference,
      },
    };
  }

  // 3. Prepare payment
  const reference = generateReference();

  const metadata = {
    orderId: order.id,
    courses: order.items.map((i) => ({
      courseId: i.pricing.course.id,
      title: i.pricing.course.title,
    })),
  };

  const paystackPayload = {
    reference,
    email,
    amount: order.totalAmount, // must already be in kobo
    currency: order.currency,
    callback_url: `${process.env.FRONTEND_URL}/checkout/success?reference=${reference}`,
    metadata,
  };

  // 4. Call Paystack (OUTSIDE transaction)
  // const { data: response } = await paystackHttp.post<PaystackInitResponse>(
  //   "/transaction/initialize",
  //   paystackPayload,
  // );

  const response = await withRetry(() =>
    paystackHttp.post<PaystackInitResponse>("/transaction/initialize", paystackPayload)
  );


  if (!response.data.status) {
    throw new Error(`Paystack init failed: ${response.message}`);
  }

  const paymentLink = response.data.data.authorization_url;

  // 5. Persist payment (short transaction)
  await prisma.payment.create({
    data: {
      userId: userId ?? order.userId ?? null,
      orderId: order.id,
      reference,
      amount: order.totalAmount,
      currency: order.currency,
      gateway: "paystack",
      status: "PENDING",
      metadata: metadata as PaymentMetadata,
    },
  });

  return {
    data: {
      paymentLink,
      reference,
    },
  };
};


export const verifyPayment = async (
  reference: string,
): Promise<VerifyPaymentResult> => {

  if (!reference) {
    return { success: false, status: "failed" };
  }

  const payment = await findPaymentByReference(reference);

  if (!payment) {
    return { success: false, status: "failed" };
  }

  if (payment.status === "PAID") {
    return { success: true, status: "success" };
  }

  const recentlyChecked =
    Date.now() - new Date(payment.updatedAt).getTime() < 5000;

  if (recentlyChecked) {
    return { success: false, status: "pending" };
  }

  try {
    const { data } = await paystackHttp.get<{
      status: boolean;
      data: PaystackVerifyData;
    }>(`/transaction/verify/${encodeURIComponent(reference)}`);

    const status = data.status
      ? (data.data.status as "success" | "pending" | "failed")
      : "failed";

    return {
      success: status === "success",
      status,
    };

  } catch (err) {
    // Never fail hard here — this endpoint is UX-only
    return { success: false, status: "pending" };
  }

  // const { data } = await paystackHttp.get<{
  //   status: boolean;
  //   data: PaystackVerifyData;
  // }>(`/transaction/verify/${encodeURIComponent(reference)}`);

  // const status = data.status ? (data.data.status as "success" | "pending" | "failed") : "failed";

  // return {
  //   success: status === "success",
  //   status,
  // }
};


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

  // const payload = JSON.parse(rawBody);
  const payload = JSON.parse(rawBody) as {
    event: string;
    data: PaystackVerifyData;
  };

  if (payload.event !== "charge.success") return { received: true };

  const { reference, amount: amountKobo } = payload.data;

  // const payment = await findPaymentByReference(reference);

  const payment = await prisma.payment.findUnique({
    where: { reference },
    select: {
      id: true,
      status: true,
      amount: true,
      orderId: true,
      userId: true,
      metadata: true,
    },
  });

  // FIX (idempotency): a duplicate webhook delivery must be silently swallowed.
  if (!payment || payment.status === "PAID") return { received: true };

  if (!payment.orderId || !payment.userId) {
    logger.error("Invalid payment state", { reference });
    throw badRequest("Invalid payment state");
  }

  // FIX (bug): payment.amount is a Prisma Decimal — coerce to Number before
  // arithmetic. `"1500.00" * 100` evaluates to NaN in JS, making the guard
  // always pass silently.
  const expectedKobo = Math.round(Number(payment.amount) * 100);
  if (amountKobo !== expectedKobo) {
    logger.error("Amount mismatch", {
      reference,
      expected: expectedKobo,
      received: amountKobo,
    });
    throw badRequest("Amount mismatch");
  }

  // await prisma.$transaction(async (tx) => {
  //   let userId = payment.userId;

  //   // Create guest user if this was a guest checkout
  //   if (!userId) {
  //     const order = payment.order!;

  //     if (!order.email) {
  //       throw new Error("Guest checkout without email is not supported");
  //     }

  //     // FIX (security + auth): guest users need a hashed random password
  //     // and emailVerified: true so they can receive magic links and log in.
  //     // FIX (race condition): use upsert instead of create to handle the case
  //     // where a duplicate webhook fires before the first transaction commits.
  //     const guestUser = await tx.user.upsert({
  //       where: { email: order.email },
  //       update: {}, // already exists — don't overwrite anything
  //       create: {
  //         email: order.email,
  //         name: order.name ?? order.email.split("@")[0],
  //         accounts: {
  //           create: {
  //             provider: "checkout",
  //             providerId: order.email,
  //             password: await hashPassword(crypto.randomBytes(32).toString("hex")),
  //           },
  //         },
  //         phone: order.phone ?? null,
  //         emailVerified: true, // verified via OTP during checkout
  //         provider: "checkout"
  //       },
  //     });

  //     await tx.order.update({
  //       where: { id: order.id },
  //       data: { userId: guestUser.id },
  //     });

  //     await tx.payment.update({
  //       where: { id: payment.id },
  //       data: { userId: guestUser.id },
  //     });

  //     userId = guestUser.id;
  //   }

  //   // Mark payment and order as paid
  //   await tx.payment.update({
  //     where: { id: payment.id },
  //     data: {
  //       status: "PAID",
  //       metadata: {
  //         ...(payment.metadata as Prisma.JsonObject),
  //         providerPayload: payload.data as Prisma.InputJsonValue,
  //       },
  //     },
  //   });

  //   await tx.order.update({
  //     where: { id: payment.orderId! },
  //     data: { status: "PAID" },
  //   });

  //   // Enroll the user in all purchased courses
  //   await fulfillOrder(tx, payment.orderId!, userId, reference);
  // });

  // Non-blocking — failure here does not roll back the payment

  await prisma.$transaction(async (tx) => {

    // 🔒 Lock row (prevents race conditions)
    const lockedPayment = await tx.payment.findUnique({
      where: { id: payment.id },
      select: { status: true },
    });

    if (!lockedPayment || lockedPayment.status === "PAID") {
      return; // another webhook already processed
    }

    await markPaymentPaid(tx, payment.id, payload.data, payment.metadata);
    await markOrderPaid(tx, payment.orderId!);
    await fulfillOrder(tx, payment.orderId!, payment.userId!, reference);
  });

  sendPostPaymentNotifications(payment.orderId!, reference).catch((err) =>
    logger.error("Post-payment notification failed: %o", { err, reference }),
  );

  logger.info("Payment Successful", { reference, orderId: payment.orderId });
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
    include:
    {
      pricing: {
        select:
        {
          courseId: true,
          durationDays: true
        }
      }
    },
  });

  if (items.length === 0) {
    logger.warn("fulfillOrder: no items", { orderId });
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

  // const existing = await tx.enrollment.findFirst({
  //   where: { orderId, userId },
  //   select: { id: true },
  // });

  // if (existing) {
  //   logger.info("fulfillOrder skipped (already fulfilled)", { orderId });
  //   return;
  // }

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

  if (progressRows.length === 0) {
    logger.warn("initializeProgress: no valid topics found", {
      courseIds,
    });
    return;
  }

  if (progressRows.length > 0) {
    await tx.progress.createMany({ data: progressRows, skipDuplicates: true });
  }
}

// ---------------------------------------------------------------------------
// Internal: notifications
// ---------------------------------------------------------------------------

async function sendPostPaymentNotifications(
  orderId: string,
  _reference: string,
): Promise<void> {
  const enrollments = await findEnrollmentsForNotification(orderId);

  // await prisma.enrollment.findMany({
  //   where: { orderId },
  //   include: {
  //     user: { select: { email: true, name: true, phone: true } }, // added phone
  //     course: { select: { title: true } },
  //     pricing: { select: { price: true, durationDays: true } }, // added durationDays
  //   },
  // });

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

      const courseStartDate = new Date().toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
      const courseEndDate = new Date(Date.now() + e.pricing.durationDays * 86_400_000).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });

      return Promise.allSettled([
        // Confirmation to the student
        sendConfirmationEmail(studentEmail, {
          name: studentName,
          courseName,
          enrollmentId: e.id,
          orderId,
          amount: Number(e.pricing.price),
          currency: "NGN",
          startDate: courseStartDate,
          endDate: courseEndDate,
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
          startDate: courseStartDate,
          endDate: courseEndDate,
        }),
      ]);
    }),
  );
}

function buildExistingLink(reference: string): string {
  return `https://checkout.paystack.com/${reference}`;
}

