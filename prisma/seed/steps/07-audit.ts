import type { Prisma } from "@prisma/client";
import type { SeedCtx } from "../context";
import { daysAgo, inDays, sid } from "../lib/helpers";

/**
 * Staff actions, shaped the way the services write them: before/after
 * values on every access or status change (architecture rule 15).
 */
export async function seedAudit(ctx: SeedCtx): Promise<void> {
  const adminId = ctx.users.admin.id;

  const entry = (
    key: string, action: string, targetType: string, targetId: string, metadata: Prisma.InputJsonObject, daysBack: number,
  ): Prisma.AdminAuditLogCreateManyInput => ({
    id: sid(`audit:${key}`), adminId, action, targetType, targetId, metadata, createdAt: daysAgo(daysBack),
  });

  await ctx.db.adminAuditLog.createMany({
    data: [
      entry("student-chidi", "STUDENT_REGISTERED", "StudentProfile", sid("student:chidi"), { source: "MANUAL", userId: ctx.users.chidi.id }, 30),
      entry("import-batch", "STUDENT_IMPORT_COMPLETED", "StudentImportBatch", sid("import:legacy-students"), { total: 17, success: 15, failed: 2 }, 30),
      entry("grant-chidi-audit", "ENROLLMENT_GRANTED", "Enrollment", sid("enrollment:grant-chidi-audit"), {
        userId: ctx.users.chidi.id, courseId: ctx.courses["audit-fundamentals"].id, reason: "Scholarship award",
        request: { mode: "days", days: 90 }, before: null, after: { status: "ACTIVE", expiresAt: inDays(90).toISOString() },
      }, 9),
      entry("grant-s04", "ENROLLMENT_GRANTED", "Enrollment", sid("enrollment:grant-student04-accounting-basics"), {
        userId: ctx.users.student04.id, courseId: ctx.courses["accounting-basics"].id, reason: "Offline payment received at the Lagos centre",
        before: null, after: { status: "ACTIVE" },
      }, 9),
      entry("member-weekend", "COHORT_MEMBER_ADDED", "Cohort", ctx.cohorts.weekend.id, { users: ["student07", "student08", "student09"].map((k) => ctx.users[k].id) }, 10),
      entry("tunde-suspended", "STUDENT_STATUS_CHANGED", "StudentProfile", sid("student:tunde"), {
        before: { status: "ACTIVE" }, after: { status: "SUSPENDED" }, reason: "Payment dispute under review",
      }, 3),
      entry("announce-welcome", "ANNOUNCEMENT_PUBLISHED", "Announcement", sid("announcement:welcome"), { audience: "ALL_STUDENTS" }, 20),
      entry("chat-delete", "CHAT_MESSAGE_DELETED", "ChatMessage", sid("msg:evening-general:deleted"), { room: ctx.rooms["evening-general"], reason: "Off-topic" }, 5),
      entry("session-cancel", "LIVE_SESSION_CANCELLED", "LiveSession", ctx.sessions["evening-cancelled"], { reason: "Instructor unavailable; rescheduled to Friday" }, 1),
    ],
    skipDuplicates: true,
  });

  console.log("  audit: 9 entries");
}