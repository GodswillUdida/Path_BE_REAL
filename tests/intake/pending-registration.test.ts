import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testPrisma, truncateAll } from "../setup/db";

const sent: Array<{ type: string; to: string; code: string; verifyUrl: string; name: string }> = [];
vi.mock("@/modules/auth/email.queue", () => ({
  enqueueAuthEmail: vi.fn(async (job: (typeof sent)[number]) => {
    sent.push(job);
  }),
}));

import {
  PENDING_LIMITS,
  resendPendingRegistration,
  startPendingRegistration,
  verifyPendingRegistration,
} from "../../src/modules/intake/pending-registration.service";
import { registerApplicantService } from "../../src/modules/intake/intake.service";
import type { CreateApplicantInput } from "../../src/modules/intake/intake.types";

const form = (over: Partial<CreateApplicantInput> = {}): CreateApplicantInput => ({
  fullName: "Ada Obi",
  email: "ada@example.test",
  phone: "08012345678",
  address: "12 Marina Road, Lagos",
  isNewStudent: true,
  papers: ["Financial Reporting"],
  password: "S3curePassw0rd!",
  ...over,
});

const lastCode = () => sent[sent.length - 1].code;
const counts = async () => ({
  users: await testPrisma.user.count(),
  applicants: await testPrisma.applicant.count(),
  profiles: await testPrisma.studentProfile.count(),
  members: await testPrisma.cohortMember.count(),
  enrollments: await testPrisma.enrollment.count(),
});

describe("pending registration (anonymous intake)", () => {
  beforeEach(async () => {
    sent.length = 0;
    await truncateAll();
  });
  afterAll(() => testPrisma.$disconnect());

  it("creates only a pending row before verification, with a hashed code and no password in the payload", async () => {
    const started = await startPendingRegistration(testPrisma, form());

    expect(await counts()).toEqual({ users: 0, applicants: 0, profiles: 0, members: 0, enrollments: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].code).toMatch(/^\d{6}$/);
    expect(sent[0].verifyUrl).toContain(started.pendingId);

    const row = await testPrisma.pendingRegistration.findUniqueOrThrow({ where: { id: started.pendingId } });
    expect(row.codeHash).not.toContain(sent[0].code);
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row.payload)).not.toContain("S3curePassw0rd");
    expect(row.passwordHash).not.toBe("S3curePassw0rd!");
  });

  it("finalizes User + PENDING Applicant + ACTIVE StudentProfile atomically; no member/enrollment; scrubs the row", async () => {
    const { pendingId } = await startPendingRegistration(testPrisma, form());
    const { user, applicant } = await verifyPendingRegistration(testPrisma, { pendingId, code: lastCode() });

    expect(user.emailVerified).toBe(true);
    expect(user.studentProfile?.status).toBe("ACTIVE");
    expect(applicant.status).toBe("PENDING");
    expect(applicant.userId).toBe(user.id);

    const profile = await testPrisma.studentProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile.applicantId).toBe(applicant.id);
    expect(profile.registrationSource).toBe("APPLICATION");
    const account = await testPrisma.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.password).toMatch(/^\$2[aby]\$/);

    const c = await counts();
    expect(c).toMatchObject({ users: 1, applicants: 1, profiles: 1, members: 0, enrollments: 0 });

    const row = await testPrisma.pendingRegistration.findUniqueOrThrow({ where: { id: pendingId } });
    expect(row.status).toBe("COMPLETED");
    expect(row.payload).toEqual({});
    expect(row.passwordHash).toBe("");
    expect(row.codeHash).toBe("");
    expect(row.userId).toBe(user.id);
  });

  it("rejects wrong codes, counts every attempt, then locks even for the right code", async () => {
    const { pendingId } = await startPendingRegistration(testPrisma, form());
    const right = lastCode();
    const wrong = right === "111111" ? "222222" : "111111";

    for (let i = 0; i < 5; i++) {
      await expect(verifyPendingRegistration(testPrisma, { pendingId, code: wrong })).rejects.toMatchObject({
        message: expect.stringContaining("Invalid or expired"),
      });
    }
    await expect(verifyPendingRegistration(testPrisma, { pendingId, code: right })).rejects.toMatchObject({
      details: { code: "CODE_ATTEMPTS_EXCEEDED" },
    });
    expect((await counts()).users).toBe(0);
  });

  it("is single-use: replay fails and concurrent verifies create exactly one account", async () => {
    const { pendingId } = await startPendingRegistration(testPrisma, form());
    const code = lastCode();

    const results = await Promise.allSettled([
      verifyPendingRegistration(testPrisma, { pendingId, code }),
      verifyPendingRegistration(testPrisma, { pendingId, code }),
      verifyPendingRegistration(testPrisma, { pendingId, code }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await counts()).users).toBe(1);

    await expect(verifyPendingRegistration(testPrisma, { pendingId, code })).rejects.toBeTruthy();
    expect((await counts()).users).toBe(1);
  });

  it("rejects an expired code", async () => {
    const { pendingId } = await startPendingRegistration(testPrisma, form());
    await testPrisma.pendingRegistration.update({
      where: { id: pendingId },
      data: { codeExpiresAt: new Date(Date.now() - 1000) },
    });
    await expect(verifyPendingRegistration(testPrisma, { pendingId, code: lastCode() })).rejects.toBeTruthy();
    expect((await counts()).users).toBe(0);
  });

  it("resend enforces cooldown and the send cap, rotates the code and resets attempts", async () => {
    const { pendingId } = await startPendingRegistration(testPrisma, form());
    const first = lastCode();

    await expect(resendPendingRegistration(testPrisma, pendingId)).rejects.toMatchObject({ status: 429 });

    const backdate = () =>
      testPrisma.pendingRegistration.update({
        where: { id: pendingId },
        data: { lastSentAt: new Date(Date.now() - PENDING_LIMITS.RESEND_COOLDOWN_MS - 1000) },
      });
    await backdate();
    await resendPendingRegistration(testPrisma, pendingId);
    const second = lastCode();
    expect(sent).toHaveLength(2);

    if (second !== first) {
      await expect(verifyPendingRegistration(testPrisma, { pendingId, code: first })).rejects.toBeTruthy();
    }
    await verifyPendingRegistration(testPrisma, { pendingId, code: second });
    expect((await counts()).users).toBe(1);
  });

  it("caps resends", async () => {
    const { pendingId } = await startPendingRegistration(testPrisma, form());
    for (let i = 1; i < PENDING_LIMITS.MAX_SENDS; i++) {
      await testPrisma.pendingRegistration.update({
        where: { id: pendingId },
        data: { lastSentAt: new Date(Date.now() - PENDING_LIMITS.RESEND_COOLDOWN_MS - 1000) },
      });
      await resendPendingRegistration(testPrisma, pendingId);
    }
    await testPrisma.pendingRegistration.update({
      where: { id: pendingId },
      data: { lastSentAt: new Date(Date.now() - PENDING_LIMITS.RESEND_COOLDOWN_MS - 1000) },
    });
    await expect(resendPendingRegistration(testPrisma, pendingId)).rejects.toMatchObject({
      details: { code: "RESEND_LIMIT" },
    });
  });

  it("resend for an unknown id is silent", async () => {
    expect(await resendPendingRegistration(testPrisma, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("a new submission supersedes the previous one", async () => {
    const a = await startPendingRegistration(testPrisma, form());
    const codeA = lastCode();
    const b = await startPendingRegistration(testPrisma, form({ fullName: "Ada O." }));
    await expect(verifyPendingRegistration(testPrisma, { pendingId: a.pendingId, code: codeA })).rejects.toBeTruthy();
    await verifyPendingRegistration(testPrisma, { pendingId: b.pendingId, code: lastCode() });
    expect((await counts()).users).toBe(1);
  });

  it("limits submissions per email per hour", async () => {
    for (let i = 0; i < PENDING_LIMITS.MAX_CREATED_PER_EMAIL_PER_HOUR; i++) {
      await startPendingRegistration(testPrisma, form());
    }
    await expect(startPendingRegistration(testPrisma, form())).rejects.toMatchObject({ status: 429 });
  });

  it("never links to an existing account or application by email", async () => {
    await testPrisma.user.create({ data: { email: "ada@example.test", name: "Existing", emailVerified: true } });
    await expect(startPendingRegistration(testPrisma, form())).rejects.toMatchObject({
      details: { code: "LOGIN_REQUIRED" },
    });
    expect(await testPrisma.pendingRegistration.count()).toBe(0);

    await truncateAll();
    await testPrisma.user.create({ data: { email: "ada@example.test", name: "Legacy", emailVerified: false } });
    await expect(startPendingRegistration(testPrisma, form())).rejects.toMatchObject({
      details: { code: "EMAIL_VERIFICATION_REQUIRED" },
    });
  });

  it("rolls back consumption if the email was taken between submit and verify", async () => {
    const { pendingId } = await startPendingRegistration(testPrisma, form());
    await testPrisma.user.create({ data: { email: "ada@example.test", name: "Race", emailVerified: true } });

    await expect(verifyPendingRegistration(testPrisma, { pendingId, code: lastCode() })).rejects.toMatchObject({
      details: { code: "LOGIN_REQUIRED" },
    });
    const row = await testPrisma.pendingRegistration.findUniqueOrThrow({ where: { id: pendingId } });
    expect(row.status).toBe("PENDING");
    expect((await counts()).applicants).toBe(0);
  });

  it("signed-in verified user is finalized immediately; unverified session is refused; email must match", async () => {
    const verified = await testPrisma.user.create({
      data: { email: "ada@example.test", name: "Ada", emailVerified: true },
    });
    const out = await registerApplicantService(testPrisma, form({ password: undefined }), {
      sessionUserId: verified.id,
    });
    expect(out.kind).toBe("registered");
    expect(await testPrisma.studentProfile.count({ where: { userId: verified.id, status: "ACTIVE" } })).toBe(1);

    await expect(
      registerApplicantService(testPrisma, form({ email: "other@example.test" }), { sessionUserId: verified.id }),
    ).rejects.toMatchObject({ details: { code: "EMAIL_MISMATCH" } });

    const unverified = await testPrisma.user.create({
      data: { email: "u@example.test", name: "U", emailVerified: false },
    });
    await expect(
      registerApplicantService(testPrisma, form({ email: "u@example.test" }), { sessionUserId: unverified.id }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
