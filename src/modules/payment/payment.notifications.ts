/**
 * payment.notifications.ts
 * Delivery of post-payment emails (course purchases AND live-class seats),
 * run by the notifications worker.
 *
 * Per-recipient idempotency: every email has a Notification +
 * NotificationDelivery row. A retry skips deliveries already SENT and
 * re-sends only failed ones. If any fail this THROWS, so BullMQ retries with
 * backoff and the job is visible in Bull Board. Nothing fails silently.
 * The admin alert is best-effort (logged at error level on failure).
 */

import logger from "@/utils/logger";
import { sendAdminNotification, sendConfirmationEmail } from "@/services/emailService";
import { ensureEmailDelivery, markDeliveryFailed, markDeliverySent } from "../notifications/notification.queries";
import { findEnrollmentsForNotification, findSeatsForNotification } from "./payment.queries";

const fmtDate = (d: Date): string =>
  d.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });

interface Line {
  userId: string;
  dedupeKey: string;
  type: "ENROLLMENT_GRANTED" | "SEAT_CONFIRMED";
  title: string;
  refType: string;
  refId: string;
  email: string;
  name: string;
  phone: string;
  productName: string;
  duration: string;
  amount: number;
  endDate: string;
}

export async function deliverPostPaymentNotifications(orderId: string): Promise<void> {
  const [enrollments, seats] = await Promise.all([
    findEnrollmentsForNotification(orderId),
    findSeatsForNotification(orderId),
  ]);

  const lines: Line[] = [];

  for (const e of enrollments) {
    const email = e.user?.email;
    if (!email) continue;
    lines.push({
      userId: e.userId,
      dedupeKey: `enrollment-confirmation:${orderId}:${e.id}`,
      type: "ENROLLMENT_GRANTED",
      title: `You're enrolled in ${e.course.title}`,
      refType: "Enrollment",
      refId: e.id,
      email,
      name: e.user.name ?? email.split("@")[0],
      phone: e.user.phone ?? "N/A",
      productName: e.course.title,
      duration: e.pricing?.accessDurationDays == null ? "Lifetime access" : `${e.pricing.accessDurationDays} days`,
      amount: Number(e.orderItem?.unitPrice ?? 0), // what was charged, not today's price
      endDate: e.expiresAt ? fmtDate(e.expiresAt) : "Never expires", // real expiry, bonus included
    });
  }

  for (const s of seats) {
    const user = s.student.user;
    if (!user?.email) continue;
    lines.push({
      userId: s.userId,
      dedupeKey: `seat-confirmation:${orderId}:${s.id}`,
      type: "SEAT_CONFIRMED",
      title: `Your seat in ${s.cohort.name} is confirmed`,
      refType: "CohortMember",
      refId: s.id,
      email: user.email,
      name: user.name ?? user.email.split("@")[0],
      phone: user.phone ?? "N/A",
      productName: `${s.cohort.name} (live classes)`,
      duration: "Live classes for the batch",
      amount: Number(s.orderItem?.unitPrice ?? 0),
      endDate: s.expiresAt ? fmtDate(s.expiresAt) : "Open-ended",
    });
  }

  const failures: string[] = [];
  const startDate = fmtDate(new Date());

  for (const l of lines) {
    const { deliveryId, alreadySent } = await ensureEmailDelivery({
      type: l.type,
      userId: l.userId,
      dedupeKey: l.dedupeKey,
      title: l.title,
      refType: l.refType,
      refId: l.refId,
      toAddress: l.email,
    });
    if (alreadySent) continue;

    try {
      await sendConfirmationEmail(l.email, {
        name: l.name,
        courseName: l.productName,
        enrollmentId: l.refId,
        orderId,
        amount: l.amount,
        currency: "NGN",
        startDate,
        endDate: l.endDate,
      });
      await markDeliverySent(deliveryId, "email-service");
    } catch (err) {
      const message = (err as Error).message;
      await markDeliveryFailed(deliveryId, message);
      failures.push(`${l.refId}: ${message}`);
      continue;
    }

    try {
      await sendAdminNotification({
        name: l.name,
        email: l.email,
        phone: l.phone,
        courseName: l.productName,
        courseDuration: l.duration,
        coursePrice: l.amount.toLocaleString("en-NG"),
        enrollmentId: l.refId,
        startDate,
        endDate: l.endDate,
      });
    } catch (err) {
      logger.error("ADMIN_NOTIFICATION_FAILED", { orderId, refId: l.refId, message: (err as Error).message });
    }
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} confirmation email(s) failed for order ${orderId}: ${failures.join("; ")}`);
  }
}
