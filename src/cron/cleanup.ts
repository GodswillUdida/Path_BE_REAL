import prisma from "../lib/prisma";

// src/cron/cleanup.ts - Run daily
export const cleanupExpired = async () => {
  await prisma.$transaction([
    prisma.otp.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.session.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    }),
  ]);
};7

export const cleanupUnverifiedUsers = async () => {
  await prisma.user.deleteMany({
    where: {
      emailVerified: false,
      createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
};

// delete after 24h
export const cleanupIdempotencyKeys = async () => {
  await prisma.idempotencyKey.deleteMany({
    where: {
      createdAt: {
        lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
  });
};

export const cleanup = async () => {
  await Promise.all([cleanupExpired(), cleanupUnverifiedUsers(), cleanupIdempotencyKeys()]);
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
