import {
  DeliveryChannel,
  DeliveryStatus,
  NotificationType,
  type Prisma,
} from "@prisma/client";
import type { SeedUsers } from "./users";

/**
 * Sample inbox rows + one SENT email delivery for the primary test user.
 * Fan-out jobs remain the real writer in production; this is for UI/dev only.
 */
export async function seedNotifications(
  tx: Prisma.TransactionClient,
  users: SeedUsers,
  announcementId: string,
  enrollmentId?: string,
) {
  const { testUser } = users;

  const announcementNotif = await tx.notification.create({
    data: {
      userId: testUser.id,
      type: NotificationType.ANNOUNCEMENT,
      title: "Batch A — Live class this week",
      body: "A new announcement was published for your cohort.",
      refType: "Announcement",
      refId: announcementId,
      dedupeKey: `announcement:${announcementId}`,
      deliveries: {
        create: {
          channel: DeliveryChannel.EMAIL,
          status: DeliveryStatus.SENT,
          toAddress: testUser.email,
          provider: "gmail",
          providerMessageId: "seed-msg-announcement-1",
          attempts: 1,
          sentAt: new Date(),
        },
      },
    },
  });

  if (enrollmentId) {
    await tx.notification.create({
      data: {
        userId: testUser.id,
        type: NotificationType.ENROLLMENT_GRANTED,
        title: "Access granted",
        body: "Your course access is active.",
        refType: "Enrollment",
        refId: enrollmentId,
        dedupeKey: `enrollment-granted:${enrollmentId}`,
        readAt: new Date(),
        deliveries: {
          create: {
            channel: DeliveryChannel.EMAIL,
            status: DeliveryStatus.SENT,
            toAddress: testUser.email,
            provider: "gmail",
            attempts: 1,
            sentAt: new Date(),
          },
        },
      },
    });
  }

  await tx.notification.create({
    data: {
      userId: testUser.id,
      type: NotificationType.LIVE_SESSION_REMINDER,
      title: "Live class in 24 hours",
      body: "Week 1 — Double Entry Foundations starts tomorrow.",
      refType: "LiveSession",
      dedupeKey: `live-reminder:seed-upcoming:24h`,
    },
  });

  console.log("✅ Notifications seeded");
  return announcementNotif;
}