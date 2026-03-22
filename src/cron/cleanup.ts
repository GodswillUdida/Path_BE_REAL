import prisma from "../config/db";

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
};
