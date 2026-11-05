import prisma from "@/lib/prisma";

/**
 * Idempotently ensure a Notification row and its EMAIL delivery row exist.
 * Safe to call again on every job retry: (userId, dedupeKey) and
 * (notificationId, channel) are unique, so nothing duplicates.
 */
export async function ensureEmailDelivery(input: {
  type?: "ENROLLMENT_GRANTED" | "SEAT_CONFIRMED";
  userId: string;
  dedupeKey: string;
  title: string;
  refType: string;
  refId: string;
  toAddress: string;
}): Promise<{ deliveryId: string; alreadySent: boolean }> {
  const notification = await prisma.notification.upsert({
    where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
    update: {},
    create: {
      userId: input.userId,
      type: input.type ?? "ENROLLMENT_GRANTED",
      title: input.title,
      refType: input.refType,
      refId: input.refId,
      dedupeKey: input.dedupeKey,
    },
    select: { id: true },
  });

  const delivery = await prisma.notificationDelivery.upsert({
    where: { notificationId_channel: { notificationId: notification.id, channel: "EMAIL" } },
    update: { attempts: { increment: 1 } },
    create: { notificationId: notification.id, channel: "EMAIL", toAddress: input.toAddress, attempts: 1 },
    select: { id: true, status: true },
  });

  return { deliveryId: delivery.id, alreadySent: delivery.status === "SENT" || delivery.status === "DELIVERED" };
}

export async function markDeliverySent(id: string, provider: string): Promise<void> {
  await prisma.notificationDelivery.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date(), provider, lastError: null },
  });
}

export async function markDeliveryFailed(id: string, error: string): Promise<void> {
  await prisma.notificationDelivery.update({
    where: { id },
    data: { status: "FAILED", lastError: error.slice(0, 500) },
  });
}
