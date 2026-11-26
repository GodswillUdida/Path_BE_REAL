/**
 * payment.fulfillment.ts
 * THE shared fulfillment path: webhook, verify endpoint and follow-up worker
 * all end up here, so they cannot drift.
 *
 * Correctness comes from CLAIMS, not read-then-check: UPDATE ... WHERE
 * status IN (PENDING, FAILED) blocks a concurrent transaction on the row
 * lock, and when it resumes it matches zero rows. Only the call that wins
 * fulfills. Money that cannot be fulfilled cleanly is surfaced as an ANOMALY
 * (refund/waitlist needed), never silently dropped.
 *
 * An order line is either a COURSE offer (Enrollment, with the free bonus
 * baked into expiresAt) or a COHORT SEAT (CohortMember + bundled content).
 */

import type { Prisma } from "@prisma/client";
import { badRequest } from "@/utils/errors";
import logger from "@/utils/logger";
import { withTransaction } from "@/utils/withTransaction";
import { initializeProgress } from "../enrollment/enrollment.progress";
import { fulfillCohortSeat } from "../cohort/cohort.seat";
import {
  findOrderItemsForFulfillment,
  findPaymentForFulfillment,
  markOrderPaid,
  markPaymentPaid,
  upsertEnrollmentForCourse,
} from "./payment.queries";

export type FulfillAnomaly =
  | "ORDER_ALREADY_PAID"
  | "COHORT_FULL"
  | "STUDENT_INELIGIBLE"
  | "MEMBERSHIP_INELIGIBLE"
  | "OFFER_UNAVAILABLE";

export const ANOMALY_MESSAGES: Record<FulfillAnomaly, string> = {
  ORDER_ALREADY_PAID: "order was already paid; this payment needs a refund",
  COHORT_FULL: "payment received but the batch is full; refund or waitlist the seat",
  STUDENT_INELIGIBLE:
    "payment received but the buyer has no ACTIVE StudentProfile; refund or complete registration",
  MEMBERSHIP_INELIGIBLE:
    "payment received but membership is suspended/removed/expired/completed; admin must resolve explicitly",
  OFFER_UNAVAILABLE:
    "payment received but the offer or cohort is no longer purchasable; refund or waitlist",
};

export interface FulfillResult {
  alreadyProcessed: boolean;
  orderId: string;
  anomaly?: FulfillAnomaly;
}

type SeatAnomaly = Exclude<FulfillAnomaly, "ORDER_ALREADY_PAID">;

type TxOutcome =
  | { kind: "payment_already_claimed" }
  | { kind: "order_already_paid" }
  | { kind: "fulfilled"; anomaly: SeatAnomaly | null };

function mapIneligibleReason(
  reason: string,
): "STUDENT_INELIGIBLE" | "MEMBERSHIP_INELIGIBLE" {
  if (reason === "NO_STUDENT_PROFILE" || reason === "STUDENT_NOT_ACTIVE") {
    return "STUDENT_INELIGIBLE";
  }
  return "MEMBERSHIP_INELIGIBLE";
}

export async function markPaidAndFulfill(
  reference: string,
  providerPayload: Prisma.InputJsonValue,
): Promise<FulfillResult | null> {
  const payment = await findPaymentForFulfillment(reference);

  if (!payment) return null;
  if (payment.status === "PAID") return { alreadyProcessed: true, orderId: payment.orderId };

  // No guest checkout: userId is required in the schema. Defensive only.
  if (!payment.userId) {
    logger.error("Invalid payment state: missing userId", { reference });
    throw badRequest("Invalid payment state");
  }
  const { id: paymentId, orderId, userId } = {
    id: payment.id,
    orderId: payment.orderId,
    userId: payment.userId,
  };

  const outcome = await withTransaction(
    async (tx): Promise<TxOutcome> => {
      if (!(await markPaymentPaid(tx, paymentId, providerPayload, payment.metadata))) {
        return { kind: "payment_already_claimed" };
      }
      // Payment stays PAID (money really was received); we must not grant access twice.
      if (!(await markOrderPaid(tx, orderId))) return { kind: "order_already_paid" };

      const { anomaly, details } = await fulfillOrder(tx, orderId, userId, reference);
      // Durable ops marker on the payment row (Payment stays PAID; money was received).
      // Retries see alreadyProcessed via PAID claim and re-read metadata if needed.
      if (anomaly) {
        const prior =
          typeof payment.metadata === "object" && payment.metadata && !Array.isArray(payment.metadata)
            ? (payment.metadata as Record<string, unknown>)
            : {};
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            metadata: {
              ...prior,
              fulfillmentAnomaly: anomaly,
              fulfillmentAnomalyAt: new Date().toISOString(),
              fulfillmentAnomalyDetails: details,
            },
          },
        });
      }
      return { kind: "fulfilled", anomaly };
    },
    { maxWait: 5_000, timeout: 20_000 },
  );

  if (outcome.kind === "fulfilled") {
    return outcome.anomaly
      ? { alreadyProcessed: false, orderId, anomaly: outcome.anomaly }
      : { alreadyProcessed: false, orderId };
  }

  if (outcome.kind === "order_already_paid") {
    logger.error("payment.anomaly.duplicate_payment: order already paid, refund required", {
      reference,
      paymentId,
      orderId,
    });
    return { alreadyProcessed: true, orderId, anomaly: "ORDER_ALREADY_PAID" };
  }
  return { alreadyProcessed: true, orderId };
}

export async function fulfillOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId: string,
  reference: string,
): Promise<{
  anomaly: SeatAnomaly | null;
  details: Array<{
    orderItemId: string;
    cohortId?: string;
    code: SeatAnomaly;
    reason?: string;
  }>;
}> {
  const items = await findOrderItemsForFulfillment(tx, orderId);
  if (items.length === 0) {
    logger.warn("fulfillOrder: no items", { orderId });
    return { anomaly: null, details: [] };
  }

  // Deterministic order (seats first, then courses by id) keeps lock
  // acquisition consistent between concurrent orders.
  const seatItems = items.filter((i) => i.cohortOfferId).sort((a, b) => a.id.localeCompare(b.id));
  const courseItems = items
    .filter((i) => i.pricing && !i.cohortOfferId)
    .sort((a, b) => a.pricing!.courseId.localeCompare(b.pricing!.courseId) || a.id.localeCompare(b.id));

  const newEnrollments: { id: string; courseId: string }[] = [];
  let anomaly: SeatAnomaly | null = null;
  const details: Array<{
    orderItemId: string;
    cohortId?: string;
    code: SeatAnomaly;
    reason?: string;
  }> = [];
  let seats = 0;
  let courses = 0;
  let renewed = 0;

  for (const item of seatItems) {
    const r = await fulfillCohortSeat(tx, {
      userId,
      offerId: item.cohortOfferId!,
      orderItemId: item.id,
      bonusDays: item.bonusDays,
    });
    if (r.kind === "full") {
      anomaly = "COHORT_FULL";
      details.push({ orderItemId: item.id, cohortId: r.cohortId, code: "COHORT_FULL" });
      logger.error("payment.anomaly.cohort_full: paid seat but batch is full", {
        orderId,
        reference,
        cohortId: r.cohortId,
        orderItemId: item.id,
      });
      continue;
    }
    if (r.kind === "offer_unavailable") {
      anomaly = "OFFER_UNAVAILABLE";
      details.push({ orderItemId: item.id, cohortId: r.cohortId, code: "OFFER_UNAVAILABLE" });
      logger.error("payment.anomaly.offer_unavailable: paid seat but offer closed", {
        orderId,
        reference,
        cohortId: r.cohortId,
        orderItemId: item.id,
      });
      continue;
    }
    if (r.kind === "ineligible") {
      const code = mapIneligibleReason(r.reason);
      anomaly = code;
      details.push({
        orderItemId: item.id,
        cohortId: r.cohortId,
        code,
        reason: r.reason,
      });
      logger.error("payment.anomaly.seat_ineligible: paid seat cannot be granted", {
        orderId,
        reference,
        cohortId: r.cohortId,
        orderItemId: item.id,
        reason: r.reason,
        code,
      });
      continue;
    }
    seats++;
    newEnrollments.push(...r.newEnrollments);
  }

  for (const item of courseItems) {
    const pricing = item.pricing!;
    const r = await upsertEnrollmentForCourse(tx, {
      userId,
      courseId: pricing.courseId,
      pricingId: item.pricingId!,
      orderItemId: item.id,
      orderId,
      accessDurationDays: pricing.accessDurationDays,
      bonusDays: item.bonusDays,
    });
    courses++;
    if (r.isNew) newEnrollments.push({ id: r.id, courseId: pricing.courseId });
    else renewed++;
  }

  logger.info("Order fulfilled", { orderId, reference, seats, courses, renewedEnrollments: renewed, anomaly });

  // Brand-new enrollments only: a renewal must not reset learner state.
  await initializeProgress(tx, newEnrollments);
  return { anomaly, details };
}
