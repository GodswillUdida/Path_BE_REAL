import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, truncateAll } from "../setup/db";
import { cleanup, cleanupPendingRegistrations, cleanupUnverifiedUsers } from "@/cron/cleanup";

const old = new Date(Date.now() - 48 * 60 * 60 * 1000);

describe("cleanup cron", () => {
  beforeEach(truncateAll);
  afterAll(() => testPrisma.$disconnect());

  it("deletes only abandoned unverified users; legacy unverified students survive and do not break the run", async () => {
    const bare = await testPrisma.user.create({
      data: { email: "bare@example.test", name: "Bare", emailVerified: false, createdAt: old },
    });
    const legacy = await testPrisma.user.create({
      data: { email: "legacy@example.test", name: "Legacy", emailVerified: false, createdAt: old },
    });
    const applicant = await testPrisma.applicant.create({
      data: {
        fullName: "Legacy",
        email: "legacy@example.test",
        phone: "08012345678",
        address: "1 Test Street",
        userId: legacy.id,
      },
    });
    await testPrisma.studentProfile.create({
      data: { userId: legacy.id, applicantId: applicant.id, registrationSource: "APPLICATION" },
    });
    const recent = await testPrisma.user.create({
      data: { email: "recent@example.test", name: "Recent", emailVerified: false },
    });
    const verified = await testPrisma.user.create({
      data: { email: "ok@example.test", name: "Ok", emailVerified: true, createdAt: old },
    });

    await expect(cleanup()).resolves.toBeUndefined(); // previously threw on the FK Restrict

    const remaining = (await testPrisma.user.findMany({ select: { id: true } })).map((u) => u.id).sort();
    expect(remaining).toEqual([legacy.id, recent.id, verified.id].sort());
    expect(remaining).not.toContain(bare.id);
    expect(await testPrisma.studentProfile.count({ where: { userId: legacy.id } })).toBe(1);
    expect(await testPrisma.applicant.count({ where: { id: applicant.id } })).toBe(1);
  });

  it("returns the number of users removed", async () => {
    await testPrisma.user.create({ data: { email: "a@example.test", emailVerified: false, createdAt: old } });
    expect(await cleanupUnverifiedUsers()).toBe(1);
  });

  it("expires stale pending registrations, scrubs PII, and purges old terminal rows", async () => {
    const base = {
      email: "p@example.test",
      passwordHash: "hash",
      payload: { fullName: "P" },
      codeHash: "abc",
      codeExpiresAt: old,
    };
    const stale = await testPrisma.pendingRegistration.create({ data: { ...base, expiresAt: old } });
    const live = await testPrisma.pendingRegistration.create({
      data: { ...base, expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const ancient = await testPrisma.pendingRegistration.create({
      data: { ...base, status: "COMPLETED", expiresAt: old },
    });
    await testPrisma.$executeRaw`UPDATE "PendingRegistration" SET "updatedAt" = ${new Date(Date.now() - 30 * 86_400_000)} WHERE id = ${ancient.id}`;

    const r = await cleanupPendingRegistrations();
    expect(r.expired).toBe(1);
    expect(r.purged).toBe(1);

    const s = await testPrisma.pendingRegistration.findUniqueOrThrow({ where: { id: stale.id } });
    expect(s.status).toBe("EXPIRED");
    expect(s.passwordHash).toBe("");
    expect(s.payload).toEqual({});
    expect((await testPrisma.pendingRegistration.findUniqueOrThrow({ where: { id: live.id } })).status).toBe("PENDING");
    expect(await testPrisma.pendingRegistration.findUnique({ where: { id: ancient.id } })).toBeNull();
  });
});
