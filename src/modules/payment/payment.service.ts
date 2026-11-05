/**
 * payment.service.ts
 * Checkout initiation, payment status check, and lost-webhook recovery.
 * Webhook ingest: payment.webhook.service.ts. Shared fulfillment:
 * payment.fulfillment.ts. No Prisma imports here.
 */

import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import logger from "@/utils/logger";
import { badRequest, forbidden, notFound } from "@/utils/errors";
import { withTransaction } from "@/utils/withTransaction";
import { assertCoursesPurchasableService } from "../enrollment/enrollment.service";
import { enqueuePaymentFollowup } from "./payment.queue";
import { enqueuePostPaymentNotifications } from "../notifications/notifcation.queue";
import { fetchTransaction, initializeTransaction, PaystackError } from "./payment.paystack.client";
import { checkChargeMatchesPayment } from "./payment.validation";
import { recordRejectedPaymentEvent } from "./payment.events.queries";
import { ANOMALY_MESSAGES, fulfillOrder, markPaidAndFulfill } from "./payment.fulfillment";
import {
  createPendingPayment,
  findOrderForInitiation,
  findPaymentByReference,
  findPaymentForRecovery,
  findPendingPaymentForOrder,
  type OrderForInitiation,
  markOrderPaid,
  markPaymentFailed,
  setPaymentAuthorizationUrl,
} from "./payment.queries";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaymentMetadata = {
  orderId: string;
  courses: { courseId: string; title: string }[];
  seats: { offerId: string; name: string }[];
};

/** Every course the order touches: bought directly or bundled in a seat. */
function courseIdsOfOrder(order: OrderForInitiation): string[] {
  const ids = new Set<string>();
  for (const i of order.items) {
    if (i.pricing) ids.add(i.pricing.course.id);
    if (i.cohortOffer) for (const c of i.cohortOffer.cohort.courses) ids.add(c.courseId);
  }
  return [...ids];
}

export interface VerifyPaymentResult {
  success: boolean;
  status: "success" | "pending" | "failed";
}

/**
 * `requiresPayment` lets the frontend tell "redirect to paymentLink" from
 * "order was free and is already fulfilled". paymentLink/reference exist
 * only when requiresPayment is true.
 */
export interface InitiatePaymentResult {
  data: {
    requiresPayment: boolean;
    orderId: string;
    paymentLink?: string;
    reference?: string;
  };
}

export type RecoveryOutcome =
  | "fulfilled"
  | "already_paid"
  | "still_pending"
  | "not_found"
  | "closed"
  | "rejected";

const generateReference = (): string => `pay_${crypto.randomBytes(12).toString("hex")}`;

function storedAuthorizationUrl(metadata: Prisma.JsonValue): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const url = (metadata as Prisma.JsonObject).authorizationUrl;
    return typeof url === "string" ? url : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. Initiate
// ---------------------------------------------------------------------------

export const initiatePaystackPayment = async (orderId: string, userId: string): Promise<InitiatePaymentResult> => {
  const order = await findOrderForInitiation(orderId);
  if (!order) throw notFound("Order not found");
  if (order.userId !== userId) throw forbidden("Order does not belong to this user");

  // Idempotent pass-through: a double-click or refresh after success is not an error.
  if (order.status === "PAID") return { data: { requiresPayment: false, orderId: order.id } };
  if (order.status !== "PENDING") throw badRequest("Order is not payable");
  if (order.expiresAt && order.expiresAt < new Date()) throw badRequest("Order expired");

  // Revoked learners cannot repurchase (checked before ANY payment or free fulfillment).
  await assertCoursesPurchasableService(userId, courseIdsOfOrder(order));

  // ── FREE CHECKOUT: skip Paystack; no Payment row is created ───────────
  if (order.totalAmount.lte(0)) {
    const fulfilled = await withTransaction(async (tx) => {
      // Claim first: a concurrent duplicate request must not fulfill twice.
      if (!(await markOrderPaid(tx, order.id))) return false;
      await fulfillOrder(tx, order.id, userId, `free_${order.id}`);
      return true;
    });

    if (fulfilled) {
      logger.info("Free order fulfilled without payment gateway", { orderId: order.id, userId });
      await enqueuePostPaymentNotifications(order.id);
    }
    return { data: { requiresPayment: false, orderId: order.id } };
  }

  // ── PAID (or mixed) CHECKOUT ──────────────────────────────────────────
  const existing = await findPendingPaymentForOrder(order.id);
  if (existing) {
    const url = storedAuthorizationUrl(existing.metadata);
    if (url) {
      return { data: { requiresPayment: true, orderId: order.id, paymentLink: url, reference: existing.reference } };
    }
    // Legacy pending row with no stored link: retire it (it can still be
    // paid late; FAILED -> PAID is allowed) and start a fresh one.
    await markPaymentFailed(existing.id);
  }

  const reference = generateReference();
  const metadata: PaymentMetadata = {
    orderId: order.id,
    courses: order.items.flatMap((i) =>
      i.pricing ? [{ courseId: i.pricing.course.id, title: i.pricing.course.title }] : [],
    ),
    seats: order.items.flatMap((i) => (i.cohortOffer ? [{ offerId: i.cohortOffer.id, name: i.cohortOffer.name }] : [])),
  };

  // Order.totalAmount / Payment.amount are real currency; kobo is a Paystack
  // wire detail and is never persisted.
  const amountKobo = Math.round(order.totalAmount.mul(100).toNumber());

  // INSERT FIRST. The partial unique index allows one PENDING payment per
  // order, so two concurrent initiates cannot create two Paystack transactions.
  const created = await createPendingPayment({
    userId,
    orderId: order.id,
    reference,
    amount: order.totalAmount,
    currency: order.currency,
    gateway: "PAYSTACK",
    status: "PENDING",
    metadata: metadata as unknown as Prisma.InputJsonObject,
  });

  if (!created) {
    const winner = await findPendingPaymentForOrder(order.id);
    const url = winner ? storedAuthorizationUrl(winner.metadata) : null;
    if (winner && url) {
      return { data: { requiresPayment: true, orderId: order.id, paymentLink: url, reference: winner.reference } };
    }
    throw badRequest("A payment is already being set up for this order. Please retry in a few seconds.");
  }

  let init;
  try {
    init = await initializeTransaction({
      reference,
      email: order.user.email,
      amount: amountKobo,
      currency: order.currency,
      callback_url: `${process.env.FRONTEND_URL}/checkout/success?reference=${reference}`,
      metadata,
    });
  } catch (err) {
    await markPaymentFailed(created.id); // customer retries with a fresh reference
    throw err;
  }

  await setPaymentAuthorizationUrl(created.id, metadata as unknown as Prisma.InputJsonObject, init.authorization_url);

  // Lost-webhook safety net. Best-effort: checkout must not fail because
  // Redis hiccuped. If order.service already enqueues this, remove one
  // (the jobId makes a duplicate enqueue a no-op).
  try {
    await enqueuePaymentFollowup({ paymentReference: reference, userId, attempt: 1 });
  } catch (err) {
    logger.error("PAYMENT_FOLLOWUP_ENQUEUE_FAILED", { reference, message: (err as Error).message });
  }

  return {
    data: { requiresPayment: true, orderId: order.id, paymentLink: init.authorization_url, reference },
  };
};

// ---------------------------------------------------------------------------
// 2. Verify: owner-only status check. Runs the SAME safe recovery path as the
//    follow-up worker, so a lost webhook is fixed within seconds of the
//    customer returning to the site. Safe because fulfillment is claim-based
//    and the amount is validated.
// ---------------------------------------------------------------------------

const lastCheckedAt = new Map<string, number>();
const MIN_CHECK_INTERVAL_MS = 3_000;

export const verifyPayment = async (reference: string, userId: string): Promise<VerifyPaymentResult> => {
  const payment = await findPaymentByReference(reference);
  // Not-yours and not-found are indistinguishable on purpose.
  if (!payment || payment.userId !== userId) return { success: false, status: "failed" };
  if (payment.status === "PAID") return { success: true, status: "success" };

  const now = Date.now();
  if (now - (lastCheckedAt.get(reference) ?? 0) < MIN_CHECK_INTERVAL_MS) {
    return { success: false, status: "pending" };
  }
  if (lastCheckedAt.size > 1_000) lastCheckedAt.clear();
  lastCheckedAt.set(reference, now);

  try {
    const outcome = await recoverPaymentIfConfirmed(reference);
    switch (outcome) {
      case "fulfilled":
      case "already_paid":
        return { success: true, status: "success" };
      case "closed":
      case "rejected":
      case "not_found":
        return { success: false, status: "failed" };
      case "still_pending":
        return { success: false, status: "pending" };
    }
  } catch (err) {
    logger.warn("verifyPayment: recovery attempt failed", { reference, message: (err as Error).message });
    return { success: false, status: "pending" };
  }
};

// ---------------------------------------------------------------------------
// 3. Recovery (verify endpoint + payment.worker.ts)
//    Asks Paystack directly, then applies the SAME validation as the
//    webhook. The amount check is not only about tampering: it also stops a
//    wrong amount on OUR side (like the old x100 bug) from granting a course
//    at the wrong price.
// ---------------------------------------------------------------------------

export async function recoverPaymentIfConfirmed(reference: string): Promise<RecoveryOutcome> {
  const payment = await findPaymentForRecovery(reference);
  if (!payment) return "not_found";
  if (payment.status === "PAID") return "already_paid";

  let txn;
  try {
    txn = await fetchTransaction(reference);
  } catch (err) {
    // 404: the customer never opened checkout, i.e. nothing to recover yet.
    if (err instanceof PaystackError && err.httpStatus === 404) return "still_pending";
    throw err; // transient: let the caller / BullMQ retry
  }

  switch (txn.status) {
    case "success":
      break;
    case "failed":
    case "abandoned":
    case "reversed":
      // Reversible: a late success can still flip FAILED -> PAID.
      await markPaymentFailed(payment.id);
      return "closed";
    default:
      return "still_pending"; // ongoing | pending | processing | queued
  }

  const check = checkChargeMatchesPayment(payment, txn);
  if (!check.ok) {
    const first = await recordRejectedPaymentEvent({
      eventId: `recovery:${reference}`,
      eventType: "recovery.verify",
      reference,
      rawPayload: txn as unknown as Prisma.InputJsonValue,
      code: check.code,
      message: check.message,
      paymentId: payment.id,
    });
    if (first) logger.error("payment.recovery.rejected", { reference, code: check.code, message: check.message });
    return "rejected";
  }

  const result = await markPaidAndFulfill(reference, txn as unknown as Prisma.InputJsonValue);
  if (!result) return "not_found";

  if (result.anomaly) {
    const first = await recordRejectedPaymentEvent({
      eventId: `recovery:${reference}`,
      eventType: "recovery.verify",
      reference,
      rawPayload: txn as unknown as Prisma.InputJsonValue,
      code: result.anomaly,
      message: ANOMALY_MESSAGES[result.anomaly],
      paymentId: payment.id,
    });
    if (first) logger.error("payment.recovery.anomaly", { reference, anomaly: result.anomaly });
    if (!result.alreadyProcessed) await enqueuePostPaymentNotifications(result.orderId);
    return "rejected";
  }

  if (result.alreadyProcessed) return "already_paid";

  await enqueuePostPaymentNotifications(result.orderId);
  logger.info("Payment recovered (webhook was likely lost)", { reference, orderId: result.orderId });
  return "fulfilled";
}
