/**
 * Pre-user email-ownership verification for anonymous applications.
 *
 * Nothing but a PendingRegistration row exists until the emailed code is
 * verified. Verification then creates User (emailVerified) + Applicant
 * (PENDING) + StudentProfile (ACTIVE) in ONE transaction. Never creates
 * CohortMember or Enrollment, never links to an existing account by email.
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { badRequest, conflict, serviceUnavailable, tooManyRequests } from "@/utils/errors";
import { hashPassword } from "@/utils/hash";
import logger from "@/utils/logger";
import { generateOTP, TTL } from "@/modules/auth/config";
import { sessionUserSelect, type SessionUser } from "@/modules/auth/auth.select";
import { enqueueAuthEmail } from "@/modules/auth/email.queue";
import {
  claimForFinalize,
  consumeAttempt,
  countCreatedSince,
  createPending,
  findPendingById,
  lockEmail,
  rotateCode,
  scrubCompleted,
  supersedeOpen,
  type PendingRow,
} from "./pending-registration.repo";
import { findApplicantByEmail, findUserIdentityByEmail, insertApplicantWithProfile, type ApplicantDetail } from "./intake.repo";
import type { CreateApplicantInput } from "./intake.types";
import { envConfig } from "@/config/envConfig";

export const PENDING_LIMITS = {
  CODE_TTL_MS: TTL.OTP, // 15 min
  REGISTRATION_TTL_MS: 24 * 60 * 60 * 1000,
  RESEND_COOLDOWN_MS: 60 * 1000,
  MAX_SENDS: 4, // first send + 3 resends
  MAX_CREATED_PER_EMAIL_PER_HOUR: 5,
} as const;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const INVALID_CODE = () =>
  badRequest("Invalid or expired verification code", { code: "INVALID_OR_EXPIRED_CODE" });

function hashCode(pendingId: string, code: string): string {
  const secret = envConfig.security.pendingRegistrationSecret;

  return createHmac("sha256", secret)
    .update(`${pendingId}:${code}`)
    .digest("hex");
}


function hashesEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

function verifyUrl(pendingId: string): string {
  const base = process.env.FRONTEND_URL;
  if (!base) throw new Error("FRONTEND_URL is not configured");
  return `${base.replace(/\/$/, "")}/apply/verify?pending=${encodeURIComponent(pendingId)}`;
}

async function sendVerificationEmail(
  to: string,
  name: string,
  code: string,
  pendingId: string,
): Promise<void> {
  try {
    await enqueueAuthEmail({ type: "application-verification", to, name, code, verifyUrl: verifyUrl(pendingId) });
  } catch (err) {
    logger.error("PENDING_REGISTRATION_EMAIL_ENQUEUE_FAILED", {
      pendingId,
      message: err instanceof Error ? err.message : String(err),
    });
    throw serviceUnavailable("We could not send the verification email. Please try again.");
  }
}

export interface PendingStarted {
  pendingId: string;
  codeExpiresAt: Date;
  resendAvailableAt: Date;
  expiresAt: Date;
}

export async function startPendingRegistration(
  prisma: PrismaClient,
  input: CreateApplicantInput,
  ctx: { ipAddress?: string } = {},
): Promise<PendingStarted> {
  const email = normalizeEmail(input.email);

  // Existing identities are never silently linked by email (login first).
  const user = await findUserIdentityByEmail(prisma, email);
  if (user) {
    throw conflict(
      user.emailVerified
        ? "An account with this email already exists. Please log in and submit the application while signed in."
        : "An account with this email already exists but is not verified. Verify your email, then log in.",
      { code: user.emailVerified ? "LOGIN_REQUIRED" : "EMAIL_VERIFICATION_REQUIRED" },
    );
  }
  if (await findApplicantByEmail(prisma, email)) {
    throw conflict("An application with this email already exists", { code: "APPLICANT_ALREADY_EXISTS" });
  }
  if (!input.password) {
    throw badRequest("Password is required to create an account for a new applicant", {
      code: "PASSWORD_REQUIRED",
    });
  }

  const passwordHash = await hashPassword(input.password);
  const { password: _omit, ...form } = { ...input, email };
  const pendingPayload = { ...form, passwordHash };

  const now = new Date();
  const id = randomUUID();
  const code = generateOTP();
  const codeExpiresAt = new Date(now.getTime() + PENDING_LIMITS.CODE_TTL_MS);
  const expiresAt = new Date(now.getTime() + PENDING_LIMITS.REGISTRATION_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await lockEmail(tx, email);
    const recent = await countCreatedSince(tx, email, new Date(now.getTime() - 60 * 60 * 1000));
    if (recent >= PENDING_LIMITS.MAX_CREATED_PER_EMAIL_PER_HOUR) {
      throw tooManyRequests("Too many verification requests for this email. Try again later.");
    }
    await supersedeOpen(tx, email);
    await createPending(tx, {
      id,
      email,
      // passwordHash,
      payload: pendingPayload as unknown as Prisma.InputJsonValue,
      codeHash: hashCode(id, code),
      codeExpiresAt,
      expiresAt,
      ipAddress: ctx.ipAddress,
    });
  });

  await sendVerificationEmail(email, input.fullName, code, id);

  return {
    pendingId: id,
    codeExpiresAt,
    resendAvailableAt: new Date(now.getTime() + PENDING_LIMITS.RESEND_COOLDOWN_MS),
    expiresAt,
  };
}

export interface PendingVerified {
  user: SessionUser;
  applicant: ApplicantDetail;
}

export async function verifyPendingRegistration(
  prisma: PrismaClient,
  input: { pendingId: string; code: string },
): Promise<PendingVerified> {
  const now = new Date();

  // 1. Count the attempt first (committed on its own; wrong guesses stay counted).
  if (!(await consumeAttempt(prisma, input.pendingId, now))) {
    const row = await findPendingById(prisma, input.pendingId);
    if (row && row.status === "PENDING" && row.attempts >= row.maxAttempts) {
      throw badRequest("Too many attempts. Request a new code.", { code: "CODE_ATTEMPTS_EXCEEDED" });
    }
    throw INVALID_CODE();
  }

  const row = await findPendingById(prisma, input.pendingId);
  if (!row || !hashesEqual(row.codeHash, hashCode(row.id, input.code))) throw INVALID_CODE();

  // 2. Atomic consume + finalize. Any failure rolls the consumption back too.
  try {
    return await prisma.$transaction(
      async (tx) => {
        if (!(await claimForFinalize(tx, row, now))) throw INVALID_CODE(); // replay / concurrent verify

        const taken = await tx.user.findUnique({ where: { email: row.email }, select: { id: true } });
        if (taken) throw conflict("An account with this email already exists", { code: "LOGIN_REQUIRED" });

        const form = row.payload as unknown as CreateApplicantInput & { passwordHash: string };
        const created = await tx.user.create({
          data: {
            name: form.fullName,
            email: row.email,
            emailVerified: true,
            accounts: {
              create: { provider: "credentials", providerId: row.email, password: form.passwordHash },
            },
          },
          select: { id: true },
        });

        const applicant = await insertApplicantWithProfile(tx, { ...form, email: row.email }, created.id);
        await scrubCompleted(tx, row.id, { userId: created.id, applicantId: applicant.id });

        const user = await tx.user.findUniqueOrThrow({ where: { id: created.id }, select: sessionUserSelect });
        return { user, applicant };
      },
      { maxWait: 5_000, timeout: 15_000 },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict("An account with this email already exists", { code: "LOGIN_REQUIRED" });
    }
    throw err;
  }
}

export async function resendPendingRegistration(
  prisma: PrismaClient,
  pendingId: string,
): Promise<{ resendAvailableAt: Date; codeExpiresAt: Date } | null> {
  const row: PendingRow | null = await findPendingById(prisma, pendingId);
  const now = new Date();
  // Unknown / closed / expired: silent (no oracle on pending ids).
  if (!row || row.status !== "PENDING" || row.expiresAt <= now) return null;

  const availableAt = new Date(row.lastSentAt.getTime() + PENDING_LIMITS.RESEND_COOLDOWN_MS);
  if (availableAt > now) {
    throw tooManyRequests(`Please wait before requesting another code.`);
  }
  if (row.sendCount >= PENDING_LIMITS.MAX_SENDS) {
    throw badRequest("Resend limit reached. Please start the application again.", { code: "RESEND_LIMIT" });
  }

  const code = generateOTP();
  const codeExpiresAt = new Date(now.getTime() + PENDING_LIMITS.CODE_TTL_MS);
  if (!(await rotateCode(prisma, row, { codeHash: hashCode(row.id, code), codeExpiresAt, now }))) {
    throw tooManyRequests("A code was just sent. Please wait before requesting another.");
  }

  const form = row.payload as unknown as Partial<CreateApplicantInput>;
  await sendVerificationEmail(row.email, form.fullName ?? "there", code, row.id);
  return { resendAvailableAt: new Date(now.getTime() + PENDING_LIMITS.RESEND_COOLDOWN_MS), codeExpiresAt };
}
