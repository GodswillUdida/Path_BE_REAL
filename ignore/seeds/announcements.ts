import {
  AnnouncementAudience,
  AnnouncementStatus,
  type Prisma,
} from "@prisma/client";
import type { SeedUsers } from "./users";

export async function seedAnnouncements(
  tx: Prisma.TransactionClient,
  users: SeedUsers,
  cohortId: string,
  courseId?: string,
) {
  const { admin } = users;

  const targeted = await tx.announcement.create({
    data: {
      title: "Batch A — Live class this week",
      body: "Join the Week 1 session using the link in your cohort space. Arrive 5 minutes early.",
      audience: AnnouncementAudience.TARGETED,
      status: AnnouncementStatus.PUBLISHED,
      sendEmail: true,
      isPinned: true,
      publishedAt: new Date(),
      recipientCount: 1,
      createdById: admin.id,
      targets: {
        create: [{ cohortId }],
      },
    },
  });

  const allStudents = await tx.announcement.create({
    data: {
      title: "Platform maintenance window",
      body: "Brief maintenance on Saturday 02:00–04:00 WAT. Recorded content remains available.",
      audience: AnnouncementAudience.ALL_STUDENTS,
      status: AnnouncementStatus.PUBLISHED,
      sendEmail: false,
      isPinned: false,
      publishedAt: new Date(),
      recipientCount: 2,
      createdById: admin.id,
    },
  });

  if (courseId) {
    await tx.announcement.create({
      data: {
        title: "New module released",
        body: "Module 3 materials are now live for Accounting Basics.",
        audience: AnnouncementAudience.TARGETED,
        status: AnnouncementStatus.PUBLISHED,
        sendEmail: true,
        publishedAt: new Date(),
        createdById: admin.id,
        targets: { create: [{ courseId }] },
      },
    });
  }

  console.log("✅ Announcements seeded");
  return { targeted, allStudents };
}