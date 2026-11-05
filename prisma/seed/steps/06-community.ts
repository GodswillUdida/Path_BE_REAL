import type { Prisma } from "@prisma/client";
import type { SeedCtx } from "../context";
import { BULK_STUDENTS } from "../config";
// import { CHAT_LINES } from "../data/content";
import { addMinutes, daysAgo, inDays, sid } from "../lib/helpers";
import { CHAT_LINES } from "../data/content";

interface AnnouncementSpec {
  key: string;
  title: string;
  body: string;
  audience: "ALL_STUDENTS" | "TARGETED";
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED";
  pinned?: boolean;
  publishedDaysAgo?: number;
  scheduledInDays?: number;
  cohortKey?: string;
  courseSlug?: string;
  recipients?: "all-active" | "evening";
  lastError?: string;
}

const ANNOUNCEMENTS: AnnouncementSpec[] = [
  { key: "welcome", title: "Welcome to Pathfinder Academy", body: "Your student account is active. Find your live classes, recordings and class chat in the Student area.", audience: "ALL_STUDENTS", status: "PUBLISHED", pinned: true, publishedDaysAgo: 20, recipients: "all-active" },
  { key: "class-moved", title: "Tomorrow's class starts at 6pm sharp", body: "Please join five minutes early. The link is on your schedule tab.", audience: "TARGETED", status: "PUBLISHED", publishedDaysAgo: 2, cohortKey: "evening", recipients: "evening" },
  { key: "course-notes", title: "New worked examples for Accounting Basics", body: "Chapter 4 worked examples are now attached to the topic resources.", audience: "TARGETED", status: "PUBLISHED", publishedDaysAgo: 6, courseSlug: "accounting-basics", recipients: "evening" },
  { key: "scheduled", title: "Mock exam next week", body: "A timed mock exam will run next Saturday. Details to follow.", audience: "TARGETED", status: "SCHEDULED", scheduledInDays: 1, cohortKey: "evening" },
  { key: "draft", title: "Weekend batch: what to bring", body: "DRAFT: calculator, workbook, notebook.", audience: "TARGETED", status: "DRAFT", cohortKey: "weekend" },
  { key: "failed", title: "Fee reminder", body: "A reminder about the outstanding second instalment.", audience: "TARGETED", status: "FAILED", publishedDaysAgo: 1, cohortKey: "evening", lastError: "Email provider rate limit (429): fan-out stopped after 4 of 9 recipients" },
];

export async function seedCommunity(ctx: SeedCtx): Promise<void> {
  const { db } = ctx;
  const adminId = ctx.users.admin.id;

  // ── announcements + targets ────────────────────────────────────────────
  const activeStudentIds = [
    "ada", "chidi", "ngozi",
    ...Array.from({ length: BULK_STUDENTS }, (_, i) => `student${String(i + 1).padStart(2, "0")}`),
  ].map((k) => ctx.users[k].id); // tunde (suspended) and bola (alumni) are excluded on purpose

  await db.announcement.createMany({
    data: ANNOUNCEMENTS.map((a) => ({
      id: sid(`announcement:${a.key}`), title: a.title, body: a.body, audience: a.audience, status: a.status,
      sendEmail: true, isPinned: a.pinned ?? false,
      scheduledFor: a.scheduledInDays !== undefined ? inDays(a.scheduledInDays) : null,
      publishedAt: a.publishedDaysAgo !== undefined ? daysAgo(a.publishedDaysAgo) : null,
      recipientCount: a.status === "PUBLISHED" ? (a.recipients === "all-active" ? activeStudentIds.length : ctx.cohorts.evening.memberIds.length) : a.status === "FAILED" ? 9 : null,
      lastError: a.lastError ?? null, createdById: adminId, createdAt: daysAgo((a.publishedDaysAgo ?? 0) + 1),
    })),
    skipDuplicates: true,
  });

  await db.announcementTarget.createMany({
    data: ANNOUNCEMENTS.filter((a) => a.cohortKey || a.courseSlug).map((a) => ({
      id: sid(`target:${a.key}`), announcementId: sid(`announcement:${a.key}`),
      cohortId: a.cohortKey ? ctx.cohorts[a.cohortKey].id : null,
      courseId: a.courseSlug ? ctx.courses[a.courseSlug].id : null, // exactly one is set (DB CHECK)
    })),
    skipDuplicates: true,
  });

  // ── fan-out results: one notification per recipient + email delivery ───
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const deliveries: Prisma.NotificationDeliveryCreateManyInput[] = [];
  const emailByUserId = new Map(Object.values(ctx.users).map((u) => [u.id, u.email]));

  for (const a of ANNOUNCEMENTS.filter((x) => x.status === "PUBLISHED")) {
    const annId = sid(`announcement:${a.key}`);
    const at = daysAgo(a.publishedDaysAgo ?? 0);
    const recipients = a.recipients === "all-active" ? activeStudentIds : ctx.cohorts.evening.memberIds;

    for (const [i, userId] of recipients.entries()) {
      const notificationId = sid(`notif:${a.key}:${userId}`);
      notifications.push({
        id: notificationId, userId, type: "ANNOUNCEMENT", title: a.title, body: a.body, refType: "Announcement", refId: annId,
        dedupeKey: `announcement:${annId}`, readAt: i % 3 === 0 ? addMinutes(at, 45) : null, createdAt: at,
      });
      const status = i % 11 === 5 ? "BOUNCED" : i % 7 === 3 ? "FAILED" : "SENT";
      deliveries.push({
        id: sid(`delivery:${a.key}:${userId}`), notificationId, channel: "EMAIL", status,
        toAddress: emailByUserId.get(userId) ?? "unknown@seed.example", provider: "email-service",
        providerMessageId: status === "FAILED" ? null : `msg_${sid(`msg:${a.key}:${userId}`).slice(0, 12)}`,
        attempts: status === "FAILED" ? 3 : 1,
        lastError: status === "FAILED" ? "Mailbox temporarily unavailable" : status === "BOUNCED" ? "550 mailbox does not exist" : null,
        sentAt: status === "FAILED" ? null : addMinutes(at, 1), createdAt: at,
      });
    }
  }
  await db.notification.createMany({ data: notifications, skipDuplicates: true });
  await db.notificationDelivery.createMany({ data: deliveries, skipDuplicates: true });

  // ── chat rooms: cohort-scoped and course-scoped ────────────────────────
  const rooms: { key: string; name: string; cohortKey?: string; courseSlug?: string }[] = [
    { key: "evening-general", name: "General", cohortKey: "evening" },
    { key: "evening-qa", name: "Q&A", cohortKey: "evening" },
    { key: "weekend-general", name: "General", cohortKey: "weekend" },
    { key: "course-accounting", name: "Accounting Basics: Discussion", courseSlug: "accounting-basics" },
  ];
  for (const r of rooms) ctx.rooms[r.key] = sid(`room:${r.key}`);

  await db.chatRoom.createMany({
    data: rooms.map((r) => ({
      id: ctx.rooms[r.key], name: r.name, isReadOnly: false, isArchived: false,
      cohortId: r.cohortKey ? ctx.cohorts[r.cohortKey].id : null,
      courseId: r.courseSlug ? ctx.courses[r.courseSlug].id : null, // exactly one is set (DB CHECK)
    })),
    skipDuplicates: true,
  });

  // Messages, spaced so cursor pagination on (createdAt, id) is exercised.
  const senderFor = ["instructor", "ada", "instructor", "chidi", "ngozi", "chidi", "instructor", "ngozi", "instructor", "ada", "instructor", "ada", "instructor", "student01", "chidi"];
  const replyTo: Record<number, number> = { 2: 1, 4: 3, 10: 9, 11: 10 };
  const start = daysAgo(5);
  const room = ctx.rooms["evening-general"];
  const messageId = (i: number): string => sid(`msg:evening-general:${i}`);

  const messages: Prisma.ChatMessageCreateManyInput[] = [
    { id: sid("msg:evening-general:system"), roomId: room, senderId: null, type: "SYSTEM", body: `${ctx.users.ada.name} joined the batch`, createdAt: addMinutes(start, -10) },
    ...CHAT_LINES.map((body, i): Prisma.ChatMessageCreateManyInput => ({
      id: messageId(i), roomId: room, senderId: ctx.users[senderFor[i]].id, type: "TEXT", body,
      clientMessageId: senderFor[i] === "instructor" ? null : `cm-${i}`, createdAt: addMinutes(start, i * 17),
    })),
    { // an image message: no body, one attachment
      id: sid("msg:evening-general:image"), roomId: room, senderId: ctx.users.ngozi.id, type: "IMAGE", body: null,
      attachments: [{ url: "https://pathfinder-pull.b-cdn.net/chat/seed/trial-balance.png", mimeType: "image/png", sizeBytes: 184_320, width: 1280, height: 720 }],
      clientMessageId: "cm-image", createdAt: addMinutes(start, 16 * 17),
    },
    { // moderated away: body scrubbed, who deleted it is recorded
      id: sid("msg:evening-general:deleted"), roomId: room, senderId: ctx.users.student01.id, type: "TEXT", body: null,
      clientMessageId: "cm-deleted", deletedAt: addMinutes(start, 17 * 17 + 3), deletedById: adminId, createdAt: addMinutes(start, 17 * 17),
    },
  ];
  await db.chatMessage.createMany({ data: messages, skipDuplicates: true });

  for (const [child, parent] of Object.entries(replyTo)) {
    await db.chatMessage.update({ where: { id: messageId(Number(child)) }, data: { replyToId: messageId(parent) } });
  }

  await db.chatMessage.createMany({
    data: [
      { id: sid("msg:course:0"), roomId: ctx.rooms["course-accounting"], senderId: ctx.users.instructor.id, type: "TEXT" as const, body: "Welcome to the course discussion. Post questions about any topic here.", createdAt: daysAgo(9) },
      { id: sid("msg:course:1"), roomId: ctx.rooms["course-accounting"], senderId: ctx.users.ada.id, type: "TEXT" as const, body: "Is the worked example in topic 2 using the reducing balance method?", clientMessageId: "cm-c1", createdAt: daysAgo(8) },
    ],
    skipDuplicates: true,
  });

  await db.chatReadState.createMany({
    data: [
      { roomId: room, userId: ctx.users.ada.id, lastReadAt: addMinutes(start, 10 * 17) },
      { roomId: room, userId: ctx.users.chidi.id, lastReadAt: addMinutes(start, 18 * 17) },
    ],
    skipDuplicates: true,
  });

  console.log(`  community: ${ANNOUNCEMENTS.length} announcements, ${notifications.length} notifications, ${rooms.length} chat rooms, ${messages.length + 2} messages`);
}