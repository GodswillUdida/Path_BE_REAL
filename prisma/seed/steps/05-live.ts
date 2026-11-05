import { createHash } from "node:crypto";
import type { LiveSessionProvider, LiveSessionStatus, Prisma } from "@prisma/client";
import type { SeedCtx } from "../context";
import { atUtc, daysAgo, sid } from "../lib/helpers";

type Account = "zoom1" | "zoom2" | "meet";

interface SessionSpec {
  key: string;
  title: string;
  cohorts: string[];
  courseSlug?: string;
  host: "instructor" | "instructor2";
  day: number; // days from today
  startHour: number; // UTC (Lagos = +1)
  hours: number;
  provider: LiveSessionProvider;
  account?: Account;
  status: LiveSessionStatus;
  joinUrl?: string;
  fallbackJoinUrl?: string;
  recordingUrl?: string;
  cancelledReason?: string;
}

const ZOOM = (n: number): string => `https://zoom.us/j/8123456${String(n).padStart(4, "0")}`;

/**
 * No two non-cancelled sessions overlap on one licence (the database
 * enforces this with an EXCLUDE constraint once manual_constraints.sql is
 * applied). The Meet and in-app sessions show the other providers.
 */
const SESSIONS: SessionSpec[] = [
  { key: "evening-past-1", title: "Chapter 3: Adjustments and accruals", cohorts: ["evening"], courseSlug: "accounting-basics", host: "instructor", day: -7, startHour: 17, hours: 2, provider: "ZOOM", account: "zoom1", status: "ENDED", joinUrl: ZOOM(1), recordingUrl: "https://zoom.us/rec/share/seed-recording-1" },
  { key: "evening-past-2", title: "Chapter 4: Bank reconciliation workshop", cohorts: ["evening"], courseSlug: "bookkeeping-essentials", host: "instructor", day: -3, startHour: 17, hours: 2, provider: "ZOOM", account: "zoom1", status: "ENDED", joinUrl: ZOOM(2) },
  { key: "evening-next", title: "Chapter 5: Preparing final accounts", cohorts: ["evening"], courseSlug: "accounting-basics", host: "instructor", day: 1, startHour: 17, hours: 2, provider: "ZOOM", account: "zoom2", status: "SCHEDULED", joinUrl: ZOOM(3) },
  { key: "evening-cancelled", title: "Revision clinic", cohorts: ["evening"], host: "instructor", day: 2, startHour: 17, hours: 2, provider: "ZOOM", account: "zoom1", status: "CANCELLED", joinUrl: ZOOM(4), cancelledReason: "Instructor unavailable; rescheduled to Friday" },
  { key: "evening-meet", title: "Q&A: statements of financial position", cohorts: ["evening"], courseSlug: "accounting-basics", host: "instructor", day: 3, startHour: 17, hours: 2, provider: "GOOGLE_MEET", account: "meet", status: "SCHEDULED", joinUrl: "https://meet.google.com/abc-defg-hij" },
  { key: "evening-inapp", title: "In-app classroom pilot: inventory valuation", cohorts: ["evening"], courseSlug: "accounting-basics", host: "instructor", day: 5, startHour: 17, hours: 2, provider: "LIVEKIT", status: "SCHEDULED", fallbackJoinUrl: ZOOM(5) },
  { key: "joint-class", title: "Joint class: introduction to financial analysis", cohorts: ["evening", "weekend"], host: "instructor", day: 7, startHour: 17, hours: 2, provider: "ZOOM", account: "zoom1", status: "SCHEDULED", joinUrl: ZOOM(6) },
  { key: "weekend-intro", title: "Weekend batch orientation", cohorts: ["weekend"], courseSlug: "financial-analysis", host: "instructor2", day: 10, startHour: 9, hours: 2, provider: "GOOGLE_MEET", account: "meet", status: "SCHEDULED", joinUrl: "https://meet.google.com/xyz-uvwx-rst" },
];

export async function seedLive(ctx: SeedCtx): Promise<void> {
  const { db } = ctx;

  // ── the client's paid licences (one meeting at a time each) ────────────
  const accounts: Record<Account, { provider: LiveSessionProvider; label: string; email: string }> = {
    zoom1: { provider: "ZOOM", label: "Zoom licence 1", email: "zoom1@academy.example" },
    zoom2: { provider: "ZOOM", label: "Zoom licence 2", email: "zoom2@academy.example" },
    meet: { provider: "GOOGLE_MEET", label: "Google Workspace seat", email: "meet@academy.example" },
  };
  const accountIds = {} as Record<Account, string>;
  for (const [key, a] of Object.entries(accounts) as [Account, (typeof accounts)[Account]][]) {
    const row = await db.meetingAccount.upsert({
      where: { provider_label: { provider: a.provider, label: a.label } },
      update: {},
      create: { id: sid(`meetingAccount:${key}`), provider: a.provider, label: a.label, accountEmail: a.email, isActive: true },
      select: { id: true },
    });
    accountIds[key] = row.id;
  }

  // ── sessions ───────────────────────────────────────────────────────────
  const sessionRows: Prisma.LiveSessionCreateManyInput[] = SESSIONS.map((s) => {
    const startsAt = atUtc(s.day, s.startHour);
    const room = s.provider === "LIVEKIT" ? `pf-${createHash("sha1").update(s.key).digest("hex").slice(0, 20)}` : null;
    ctx.sessions[s.key] = sid(`session:${s.key}`);
    return {
      id: ctx.sessions[s.key],
      title: s.title,
      description: `${s.title}. Bring your workbook and questions.`,
      courseId: s.courseSlug ? ctx.courses[s.courseSlug].id : null,
      hostId: ctx.users[s.host].id,
      startsAt,
      endsAt: atUtc(s.day, s.startHour + s.hours),
      provider: s.provider,
      joinUrl: s.joinUrl ?? null, // null only for LIVEKIT (DB CHECK)
      fallbackJoinUrl: s.fallbackJoinUrl ?? null,
      roomName: room,
      meetingAccountId: s.account ? accountIds[s.account] : null,
      listedPublicly: true,
      status: s.status,
      cancelledReason: s.cancelledReason ?? null,
      recordingUrl: s.recordingUrl ?? null,
      createdAt: daysAgo(14),
    };
  });
  await db.liveSession.createMany({ data: sessionRows, skipDuplicates: true });

  await db.liveSessionCohort.createMany({
    data: SESSIONS.flatMap((s) =>
      s.cohorts.map((c) => ({ id: sid(`sessionCohort:${s.key}:${c}`), sessionId: ctx.sessions[s.key], cohortId: ctx.cohorts[c].id })),
    ),
    skipDuplicates: true,
  });

  // ── recordings: one ready, one still processing on Bunny ───────────────
  await db.liveSessionRecording.createMany({
    data: [
      {
        id: sid("recording:evening-past-1"), sessionId: ctx.sessions["evening-past-1"], source: "ZOOM_IMPORT", sourceRef: "zoom_rec_seed_001",
        provider: "BUNNY", providerAssetId: "seed-rec-0001", status: "READY", durationSeconds: 6900, fileSizeBytes: BigInt(412_000_000),
        thumbnailUrl: "https://picsum.photos/seed/recording-1/400/225", readyAt: daysAgo(6),
      },
      {
        id: sid("recording:evening-past-2"), sessionId: ctx.sessions["evening-past-2"], source: "ZOOM_IMPORT", sourceRef: "zoom_rec_seed_002",
        provider: "BUNNY", providerAssetId: "seed-rec-0002", status: "PROCESSING", durationSeconds: null,
      },
    ],
    skipDuplicates: true,
  });

  console.log(`  live: ${Object.keys(accounts).length} licences, ${SESSIONS.length} sessions, 2 recordings`);
}