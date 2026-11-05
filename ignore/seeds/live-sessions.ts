import {
  LiveSessionProvider,
  LiveSessionStatus,
  RecordingSource,
  VideoProvider,
  VideoStatus,
  type Prisma,
} from "@prisma/client";
import type { SeedUsers } from "./users";

export async function seedLiveSessions(
  tx: Prisma.TransactionClient,
  users: SeedUsers,
  cohortId: string,
  meetingAccountId: string,
  courseId?: string,
) {
  const { instructor } = users;

  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 90 * 60 * 1000);

  const upcoming = await tx.liveSession.create({
    data: {
      title: "Week 1 — Double Entry Foundations",
      description: "Intro live class for the Lagos diploma batch",
      courseId: courseId ?? null,
      hostId: instructor.id,
      startsAt,
      endsAt,
      provider: LiveSessionProvider.ZOOM,
      joinUrl: "https://zoom.us/j/seed-session-upcoming",
      passcode: "seed123",
      fallbackJoinUrl: "https://meet.google.com/seed-fallback",
      meetingAccountId,
      listedPublicly: true,
      status: LiveSessionStatus.SCHEDULED,
      cohorts: { create: [{ cohortId }] },
    },
  });

  const pastStarts = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pastEnds = new Date(pastStarts.getTime() + 90 * 60 * 1000);

  const past = await tx.liveSession.create({
    data: {
      title: "Orientation — Cohort Welcome",
      description: "Already held; has a READY recording",
      courseId: courseId ?? null,
      hostId: instructor.id,
      startsAt: pastStarts,
      endsAt: pastEnds,
      provider: LiveSessionProvider.ZOOM,
      joinUrl: "https://zoom.us/j/seed-session-past",
      meetingAccountId,
      status: LiveSessionStatus.ENDED,
      recordingUrl: "https://zoom.us/rec/seed-orientation",
      cohorts: { create: [{ cohortId }] },
      recordings: {
        create: {
          source: RecordingSource.ZOOM_IMPORT,
          sourceRef: "zoom-rec-seed-001",
          provider: VideoProvider.BUNNY,
          providerAssetId: "bvid_seed_live_001",
          status: VideoStatus.READY,
          durationSeconds: 5400,
          thumbnailUrl: "https://picsum.photos/seed/live-rec/400/225",
          readyAt: pastEnds,
        },
      },
    },
  });

  console.log("✅ LiveSessions + recording seeded");
  return { upcoming, past };
}