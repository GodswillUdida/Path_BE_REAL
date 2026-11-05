/**
 * payment.events.queries.ts
 * Persistence for PaymentEvent (one row per gateway webhook delivery).
 * Deliberately NOT transaction-composable: recordPaymentEvent relies on a
 * unique-violation, which would abort an enclosing transaction.
 */

import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";

const GATEWAY = "PAYSTACK" as const;

export interface RecordedEvent {
  id: string;
  /** True when this event already succeeded or was permanently rejected. */
  terminal: boolean;
}

/**
 * Insert-or-find. A redelivery of an event that has NOT finished (previous
 * attempt hit a transient error) is returned as non-terminal so the retry
 * actually reprocesses it; only processed or permanently rejected events
 * are short-circuited.
 */
export async function recordPaymentEvent(input: {
  eventId: string;
  eventType: string;
  reference: string | null;
  rawPayload: Prisma.InputJsonValue;
}): Promise<RecordedEvent> {
  try {
    const row = await prisma.paymentEvent.create({
      data: {
        gateway: GATEWAY,
        eventId: input.eventId,
        eventType: input.eventType,
        reference: input.reference,
        rawPayload: input.rawPayload,
        signatureValid: true, // only ever called after verification
      },
      select: { id: true },
    });
    return { id: row.id, terminal: false };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.paymentEvent.update({
        where: { gateway_eventId: { gateway: GATEWAY, eventId: input.eventId } },
        data: { attempts: { increment: 1 } },
        select: { id: true, processedAt: true, processingError: true },
      });
      return { id: existing.id, terminal: existing.processedAt !== null || existing.processingError !== null };
    }
    throw e;
  }
}

export async function markPaymentEventProcessed(id: string, paymentId?: string): Promise<void> {
  await prisma.paymentEvent.update({
    where: { id },
    data: { processedAt: new Date(), processingError: null, ...(paymentId ? { paymentId } : {}) },
  });
}

/**
 * PERMANENT failure (amount mismatch, unknown reference, ...). Terminal
 * until an operator clears processingError. Surface these on a dashboard
 * and alert: money may have moved.
 */
export async function markPaymentEventRejected(
  id: string,
  code: string,
  message: string,
  paymentId?: string,
): Promise<void> {
  await prisma.paymentEvent.update({
    where: { id },
    data: { processingError: `${code}: ${message}`.slice(0, 500), ...(paymentId ? { paymentId } : {}) },
  });
}

export async function findPaymentForWebhook(reference: string) {
  return prisma.payment.findUnique({
    where: { reference },
    select: { id: true, status: true, amount: true, currency: true, orderId: true, userId: true },
  });
}

/**
 * Record an INTERNAL anomaly (recovery mismatch, exhausted follow-up) as a
 * terminal, queryable PaymentEvent so it shows up beside webhook rejections.
 * Returns true only the first time (callers alert once, not on every retry).
 */
export async function recordRejectedPaymentEvent(input: {
  eventId: string;
  eventType: string;
  reference: string | null;
  rawPayload: Prisma.InputJsonValue;
  code: string;
  message: string;
  paymentId?: string;
}): Promise<boolean> {
  const rec = await recordPaymentEvent({
    eventId: input.eventId,
    eventType: input.eventType,
    reference: input.reference,
    rawPayload: input.rawPayload,
  });
  if (rec.terminal) return false;
  await markPaymentEventRejected(rec.id, input.code, input.message, input.paymentId);
  return true;
}
