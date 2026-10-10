import axios from "axios";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import logger from "@/utils/logger";
import { verifyPaystackSignature } from "@/lib/paymentProvider";
import { sendAdminNotification, sendConfirmationEmail,  } from "@/services/emailService";
import { badRequest, forbidden, notFound, unauthorized } from "@/utils/errors";
import { Prisma } from "@prisma/client";
import {
  findEnrollmentsForNotification,
  findOrderForInitiation,
  findPaymentByReference,
  findPendingPaymentForOrder,
  findOrderItemsForFulfillment,
  upsertEnrollmentForCourse,
  findFirstTopicsForCourses,
  createProgressRows,
  markOrderPaid,
  markPaymentPaid,
} from "./payment.queries";
import { withRetry } from "@/utils/retry";

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

export interface VerifyPaymentResult {
  success: boolean;
  status: "success" | "pending" | "failed";
}

/**
 * FIXED — `requiresPayment` is new. The frontend needs to distinguish
 * "here's a paymentLink, redirect the user to Paystack" from "this order
 * was free, it's already fulfilled, skip straight to success." Previously
 * this type unconditionally promised a paymentLink/reference, which made
 * no sense for a ₦0 order — there is no Paystack transaction to redirect
 * to. This IS a breaking response-shape change for the
 * POST /payments/paystack/initialize endpoint — the frontend needs a
 * corresponding update to branch on `requiresPayment` before assuming
 * `paymentLink` exists.
 *
 * `magicToken`/guest-checkout support was removed from this result type —
 * it was declared before but never actually populated by any code path
 * (order creation requires an authenticated userId; there's no guest
 * checkout flow implemented anywhere in this codebase currently). A type
 * promising a field no code path ever sets is worse than no field at all.
 * Reintroduce it deliberately if/when guest checkout is actually built.
 */
export interface InitiatePaymentResult {
  data: {
    requiresPayment: boolean;
    orderId: string;
    paymentLink?: string;
    reference?: string;
  };
}

// ---------------------------------------------------------------------------
// Paystack HTTP client
// ---------------------------------------------------------------------------

const paystackHttp = axios.create({
  baseURL: "https://api.paystack.co",
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

const generateReference = (): string => `pay_${crypto.randomBytes(12).toString("hex")}`;

function buildExistingLink(reference: string): string {
  return `https://checkout.paystack.com/${reference}`;
}

// ---------------------------------------------------------------------------
// 1. Initiate — branches on free vs paid, handles mixed carts
// ---------------------------------------------------------------------------

export const initiatePaystackPayment = async (
  orderId: string,
  userId: string,
): Promise<InitiatePaymentResult> => {
  const order = await findOrderForInitiation(orderId);
  if (!order) throw notFound("Order not found");
  if (order.userId !== userId) throw forbidden("Order does not belong to this user");

  // FIXED: an already-PAID order previously fell into
  // `if (order.status !== "PENDING") throw badRequest("Order is not payable")`
  // — meaning a double-click or a page refresh after successful payment
  // (free OR paid) surfaced as an error to a customer who has, in fact,
  // already gotten what they paid for. Idempotent pass-through instead.
  if (order.status === "PAID") {
    return { data: { requiresPayment: false, orderId: order.id } };
  }
  if (order.status !== "PENDING") {
    throw badRequest("Order is not payable");
  }

  // FIXED: `order.expiresAt!` — non-null-asserted a nullable field.
  // order.service.ts always sets expiresAt today, but asserting it here
  // means a future order-creation path that omits it would crash with a
  // raw comparison against `null` rather than failing loudly or being
  // treated as non-expiring.
  if (order.expiresAt && order.expiresAt < new Date()) {
    throw badRequest("Order expired");
  }

  const email = order.user?.email ?? order.email;
  if (!email) throw badRequest("No email associated with this order");

  // ── FREE CHECKOUT — skip Paystack entirely ─────────────────────────────
  //
  // Gate on totalAmount, not just the isFreeOrder flag — belt-and-suspenders
  // against any future data path where isFreeOrder and totalAmount could
  // theoretically disagree (e.g. a manually zeroed price without the
  // isFree flag set). Paystack itself would reject a genuine ₦0 charge
  // anyway, so this is also just avoiding a guaranteed-failing API call.
  //
  // No Payment row is created for a free order — PaymentGateway is a
  // required, non-nullable enum with only PAYSTACK/FLUTTERWAVE/STRIPE as
  // values; there's no "NONE" option, and forcing one of those onto a
  // transaction that never touched a gateway would be actively misleading
  // for reconciliation later. Order.isFreeOrder already exists precisely
  // to represent this case without a Payment row. If you want an audit
  // trail entry for free enrollments beyond the Order row itself and
  // AdminAuditLog, that's a schema decision (e.g. a nullable gateway or a
  // "NONE" enum value) — flagging rather than guessing at it here.
  const isFreeCheckout = Number(order.totalAmount) <= 0;

  if (isFreeCheckout) {
    await prisma.$transaction(async (tx) => {
      await markOrderPaid(tx, order.id);
      await fulfillOrder(tx, order.id, userId, `free_${order.id}`);
    });

    logger.info("Free order fulfilled without payment gateway", {
      orderId: order.id,
      userId,
      isFreeOrderFlag: order.isFreeOrder,
    });

    sendPostPaymentNotifications(order.id, `free_${order.id}`).catch((err) =>
      logger.error("Post-fulfillment notification failed (free order)", { err, orderId: order.id }),
    );

    return { data: { requiresPayment: false, orderId: order.id } };
  }

  // ── PAID (or mixed) CHECKOUT — proceed via Paystack ─────────────────────
  // Paystack is charged exactly `order.totalAmount`, which already
  // excludes any free items' $0 contribution (computed in
  // order.service.ts's createOrder) — a mixed cart needs no special
  // handling here beyond this branch existing; fulfillOrder() below
  // enrolls every OrderItem regardless of price once payment succeeds.

  const existingPayment = await findPendingPaymentForOrder(orderId);
  if (existingPayment) {
    return {
      data: {
        requiresPayment: true,
        orderId: order.id,
        paymentLink: buildExistingLink(existingPayment.reference),
        reference: existingPayment.reference,
      },
    };
  }

  const reference = generateReference();
  const metadata: PaymentMetadata = {
    orderId: order.id,
    courses: order.items.map((i) => ({ courseId: i.pricing.course.id, title: i.pricing.course.title })),
  };

  // FIXED — CRITICAL: previously sent `order.totalAmount` directly with a
  // comment claiming "must already be in kobo." That was only ever true
  // while order.service.ts ALSO (incorrectly) multiplied by 100 before
  // persisting — a bug fixed earlier in this refactor. Order.totalAmount
  // is now correctly stored as real currency (e.g. 45000.00 NGN). Paystack
  // requires kobo. Without this ×100 here, a ₦45,000 course charges the
  // customer ₦450 — a 100x undercharge. This is the exact conversion point
  // flagged as future work when the storage-side bug was fixed.
  const amountKobo = Math.round(Number(order.totalAmount) * 100);

  const paystackPayload = {
    reference,
    email,
    amount: amountKobo,
    currency: order.currency,
    callback_url: `${process.env.FRONTEND_URL}/checkout/success?reference=${reference}`,
    metadata,
  };

  const response = await withRetry(() =>
    paystackHttp.post<PaystackInitResponse>("/transaction/initialize", paystackPayload),
  );

  if (!response.data.status) {
    throw new Error(`Paystack init failed: ${response.data.message}`);
  }

  await prisma.payment.create({
    data: {
      userId,
      orderId: order.id,
      reference,
      amount: order.totalAmount, // Payment.amount stores real currency, same convention as Order.totalAmount — kobo is a wire-protocol detail for Paystack only, never persisted
      currency: order.currency,
      gateway: "PAYSTACK",
      status: "PENDING",
      metadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    data: {
      requiresPayment: true,
      orderId: order.id,
      paymentLink: response.data.data.authorization_url,
      reference,
    },
  };
};

// ---------------------------------------------------------------------------
// 2. Verify — UX-only status peek, never fulfills (webhook/worker do that)
// ---------------------------------------------------------------------------

export const verifyPayment = async (reference: string): Promise<VerifyPaymentResult> => {
  if (!reference) return { success: false, status: "failed" };

  const payment = await findPaymentByReference(reference);
  if (!payment) return { success: false, status: "failed" };
  if (payment.status === "PAID") return { success: true, status: "success" };

  const recentlyChecked = Date.now() - new Date(payment.updatedAt).getTime() < 5000;
  if (recentlyChecked) return { success: false, status: "pending" };

  try {
    const { data } = await paystackHttp.get<{ status: boolean; data: PaystackVerifyData }>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    const status = data.status ? (data.data.status as "success" | "pending" | "failed") : "failed";
    return { success: status === "success", status };
  } catch {
    return { success: false, status: "pending" };
  }
};

// ---------------------------------------------------------------------------
// 3. Shared fulfillment path — used by BOTH the webhook and the follow-up
//    worker, so a lost webhook can be recovered without duplicating (or
//    drifting from) the fulfillment logic.
//
// Amount verification is NOT done in here — it's specific to the webhook
// path, where the payload is untrusted, externally-supplied input that
// could be forged. The follow-up worker's `verifyPayment()` call already
// goes directly to Paystack over an authenticated connection (our own
// secret key) — there's no tampering surface to defend against there, so
// no separate amount check is needed on that path.
// ---------------------------------------------------------------------------

async function markPaidAndFulfill(
  reference: string,
  providerPayload: Prisma.InputJsonValue,
): Promise<{ alreadyProcessed: boolean; orderId: string } | null> {
  const payment = await prisma.payment.findUnique({
    where: { reference },
    select: { id: true, status: true, orderId: true, userId: true, metadata: true },
  });

  if (!payment) return null;
  if (payment.status === "PAID") return { alreadyProcessed: true, orderId: payment.orderId };
  if (!payment.orderId || !payment.userId) {
    logger.error("Invalid payment state — missing orderId/userId", { reference });
    throw badRequest("Invalid payment state");
  }

  await prisma.$transaction(async (tx) => {
    // Row lock + re-check inside the transaction — closes the race window
    // between the read above and this write (two concurrent deliveries of
    // the same webhook, or a webhook racing the follow-up worker).
    const locked = await tx.payment.findUnique({ where: { id: payment.id }, select: { status: true } });
    if (!locked || locked.status === "PAID") return;

    await markPaymentPaid(tx, payment.id, providerPayload, payment.metadata);
    await markOrderPaid(tx, payment.orderId!);
    await fulfillOrder(tx, payment.orderId!, payment.userId!, reference);
  });

  return { alreadyProcessed: false, orderId: payment.orderId };
}

// ---------------------------------------------------------------------------
// 4. Webhook — verifies signature + amount, then delegates to the shared
//    fulfillment path above.
// ---------------------------------------------------------------------------

export const processPaymentWebhook = async (
  rawBody: string,
  signature: string | undefined,
): Promise<{ received: true }> => {
  if (!verifyPaystackSignature(rawBody, signature)) {
    throw unauthorized("Invalid webhook signature");
  }

  const payload = JSON.parse(rawBody) as { event: string; data: PaystackVerifyData };
  if (payload.event !== "charge.success") return { received: true };

  const { reference, amount: amountKobo } = payload.data;

  const payment = await prisma.payment.findUnique({
    where: { reference },
    select: { id: true, status: true, amount: true, orderId: true, userId: true },
  });

  if (!payment || payment.status === "PAID") return { received: true }; // idempotent — duplicate delivery
  if (!payment.orderId || !payment.userId) {
    logger.error("Invalid payment state", { reference });
    throw badRequest("Invalid payment state");
  }

 
  const expectedKobo = Math.round(Number(payment.amount) * 100);
  if (amountKobo !== expectedKobo) {
    logger.error("Amount mismatch", { reference, expected: expectedKobo, received: amountKobo });
    throw badRequest("Amount mismatch");
  }

  const result = await markPaidAndFulfill(reference, payload.data);
  if (!result) {
    logger.warn("Webhook for unknown payment reference — ignoring", { reference });
    return { received: true };
  }

  if (!result.alreadyProcessed) {
    sendPostPaymentNotifications(result.orderId, reference).catch((err) =>
      logger.error("Post-payment notification failed", { err, reference }),
    );
    logger.info("Payment successful", { reference, orderId: result.orderId });
  }

  return { received: true };
};

// ---------------------------------------------------------------------------
// 5. Follow-up recovery — exported for payment.worker.ts. Independently
//    confirms status directly with Paystack (not from user input, so no
//    amount-tamper surface) and fulfills via the same shared path.
// ---------------------------------------------------------------------------

export async function recoverPaymentIfConfirmed(reference: string): Promise<"fulfilled" | "already_paid" | "still_pending" | "not_found"> {
  const result = await verifyPayment(reference);

  if (result.status !== "success") return "still_pending";

  const payment = await findPaymentByReference(reference);
  if (!payment) return "not_found";

  const fulfillment = await markPaidAndFulfill(reference, { recoveredBy: "follow-up-worker" } as unknown as Prisma.InputJsonValue);
  if (!fulfillment) return "not_found";

  if (!fulfillment.alreadyProcessed) {
    sendPostPaymentNotifications(fulfillment.orderId, reference).catch((err) =>
      logger.error("Post-payment notification failed (recovered)", { err, reference }),
    );
    logger.info("Payment recovered via follow-up worker — webhook was likely lost", { reference, orderId: fulfillment.orderId });
    return "fulfilled";
  }

  return "already_paid";
}

// ---------------------------------------------------------------------------
// Internal: fulfillment
// ---------------------------------------------------------------------------

async function fulfillOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId: string,
  reference: string,
): Promise<void> {
  const items = await findOrderItemsForFulfillment(tx, orderId);
  if (items.length === 0) {
    logger.warn("fulfillOrder: no items", { orderId });
    return;
  }

  const results: { id: string; isNew: boolean; courseId: string }[] = [];
  for (const item of items) {
    const result = await upsertEnrollmentForCourse(tx, {
      userId,
      courseId: item.pricing.courseId,
      pricingId: item.pricingId,
      orderItemId: item.id,
      orderId,
      accessDurationDays: item.pricing.accessDurationDays,
    });
    results.push({ ...result, courseId: item.pricing.courseId });
  }

  logger.info("Order fulfilled", {
    orderId,
    reference,
    newEnrollments: results.filter((r) => r.isNew).length,
    renewedEnrollments: results.filter((r) => !r.isNew).length,
  });

  // Only initialize progress for brand-new enrollments — a renewal
  // shouldn't reset an existing learner's current-topic/progress state.
  const newEnrollments = results.filter((r) => r.isNew);
  await initializeProgress(tx, newEnrollments);
}

async function initializeProgress(
  tx: Prisma.TransactionClient,
  enrollments: { id: string; courseId: string }[],
): Promise<void> {
  if (enrollments.length === 0) return;

  const courseIds = enrollments.map((e) => e.courseId);
  const courses = await findFirstTopicsForCourses(tx, courseIds);

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
    logger.warn("initializeProgress: no valid topics found", { courseIds });
    return;
  }

  await createProgressRows(tx, progressRows);
}

// ---------------------------------------------------------------------------
// Internal: notifications
// ---------------------------------------------------------------------------

async function sendPostPaymentNotifications(orderId: string, _reference: string): Promise<void> {
  const enrollments = await findEnrollmentsForNotification(orderId);
  const notifiable = enrollments.filter((e) => !!e.user?.email);

  await Promise.allSettled(
    notifiable.map((e) => {
      const studentName = e.user!.name ?? e.user!.email.split("@")[0];
      const studentEmail = e.user!.email;
      const studentPhone = e.user!.phone ?? "N/A";
      const courseName = e.course.title;
      const coursePrice = Number(e.pricing.price).toLocaleString("en-NG");

  
      const isLifetime = e.pricing.accessDurationDays === null;
      const courseDuration = isLifetime ? "Lifetime access" : `${e.pricing.accessDurationDays} days`;

      const courseStartDate = new Date().toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
      const courseEndDate = isLifetime
        ? "Never expires"
        : new Date(Date.now() + e.pricing.accessDurationDays! * 86_400_000).toLocaleDateString("en-NG", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });

      return Promise.allSettled([
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