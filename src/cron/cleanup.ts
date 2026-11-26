import prisma from "../lib/prisma";
import { sweepPending } from "../modules/intake/pending-registration.repo";

const DAY_MS = 24 * 60 * 60 * 1000;

// src/cron/cleanup.ts - Run daily
export const cleanupExpired = async () => {
  await prisma.session.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
    },
  });
};

/**
 * Deletes ONLY abandoned, unverified accounts that own nothing.
 *
 * Unverified users that hold a StudentProfile, an application, orders,
 * payments, enrollments or other records are LEGACY data from the old
 * register-before-verify flow. They must be audited (see
 * scripts/db/verify-production-constraints.sql), never bulk-deleted:
 * StudentProfile.user is onDelete: Restrict, so such a delete would also throw.
 */
export const cleanupUnverifiedUsers = async () => {
  const { count } = await prisma.user.deleteMany({
    where: {
      emailVerified: false,
      createdAt: { lt: new Date(Date.now() - DAY_MS) },
      studentProfile: { is: null },
      applications: { none: {} },
      orders: { none: {} },
      payments: { none: {} },
      enrollments: { none: {} },
      carts: { none: {} },
      cohortInstructorOf: { none: {} },
      courses: { none: {} },
    },
  });
  return count;
};

/** Expires stale pending registrations (scrubbing PII) and purges old terminal rows. */
export const cleanupPendingRegistrations = async () =>
  sweepPending(prisma, new Date(), new Date(Date.now() - 7 * DAY_MS));

// delete after 24h
export const cleanupIdempotencyKeys = async () => {
  await prisma.idempotencyKey.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - DAY_MS) } },
  });
};

/**
 * Jobs are independent: one failing job must not skip the others. Failures
 * are reported (and make the process exit non-zero) instead of being lost.
 */
export const cleanup = async () => {
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ["cleanupExpired", cleanupExpired],
    ["cleanupUnverifiedUsers", cleanupUnverifiedUsers],
    ["cleanupPendingRegistrations", cleanupPendingRegistrations],
    ["cleanupIdempotencyKeys", cleanupIdempotencyKeys],
  ];
  const results = await Promise.allSettled(jobs.map(([, job]) => job()));
  const failures = results.flatMap((r, i) =>
    r.status === "rejected" ? [{ job: jobs[i][0], error: r.reason }] : [],
  );
  for (const f of failures) console.error(`Cleanup job failed: ${f.job}`, f.error);
  if (failures.length > 0) throw new Error(`${failures.length} cleanup job(s) failed`);
};

if (require.main === module) {
  cleanup()
    .then(() => {
      console.log("Cleanup completed successfully.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error during cleanup:", error);
      process.exit(1);
    });
}
