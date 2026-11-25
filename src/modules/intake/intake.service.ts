import { PrismaClient, ApplicantStatus } from "@prisma/client";
import {
  createApplicantWithProfile,
  deleteApplicant,
  existsByEmail,
  findApplicantByEmail,
  findUserIdentityByEmail,
  findUserIdentityById,
  getApplicantById,
  getCountByStatus,
  listApplicants,
  updateApplicant,
  updateApplicantStatus,
} from "./intake.repo";
import {
  CreateApplicantInput,
  UpdateApplicantInput,
  ListApplicantsQuery,
  ApplicantResponse,
  ResolvedIdentity,
} from "./intake.types";
import { badRequest, conflict, unauthorized } from "@/utils/errors";
import { hashPassword } from "@/utils/hash";
import { generateOTP, hashOTP, TTL } from "@/modules/auth/config";
import { enqueueAuthEmail } from "@/modules/auth/email.queue";
import logger from "@/utils/logger";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const formatApplicantResponse = (
  applicant: NonNullable<Awaited<ReturnType<typeof getApplicantById>>>,
  extras?: { emailVerificationRequired?: boolean },
): ApplicantResponse => ({
  id: applicant.id,
  fullName: applicant.fullName,
  email: applicant.email,
  phone: applicant.phone,
  address: applicant.address,
  lectureCenter: applicant.lectureCenter,
  previousCenter: applicant.previousCenter,
  isNewStudent: applicant.isNewStudent,
  level: applicant.level,
  careerChallenges: applicant.careerChallenges,
  referredBy: applicant.referredBy,
  documents: applicant.documents || [],
  status: applicant.status,
  userId: applicant.userId,
  cohortOfferId: applicant.cohortOfferId,
  createdAt: applicant.createdAt,
  updatedAt: applicant.updatedAt,
  papers: applicant.papers || [],
  employment: applicant.employment || undefined,
  sponsor: applicant.sponsor || undefined,
  studentProfile: applicant.studentProfile
    ? {
        id: applicant.studentProfile.id,
        status: applicant.studentProfile.status,
        registrationSource: applicant.studentProfile.registrationSource,
        userId: applicant.studentProfile.userId,
      }
    : null,
  emailVerificationRequired: extras?.emailVerificationRequired,
});

type IdentityResult = {
  identity: ResolvedIdentity;
  emailVerificationRequired: boolean;
  plainOtp?: string;
};

async function resolveIdentity(
  prisma: PrismaClient,
  input: CreateApplicantInput,
  sessionUserId?: string,
): Promise<IdentityResult> {
  const email = normalizeEmail(input.email);

  if (sessionUserId) {
    const sessionUser = await findUserIdentityById(prisma, sessionUserId);
    if (!sessionUser) throw unauthorized("Invalid session");

    if (normalizeEmail(sessionUser.email) !== email) {
      throw badRequest(
        "Application email must match the signed-in account",
        { code: "EMAIL_MISMATCH" },
      );
    }

    return {
      identity: {
        kind: "existing",
        userId: sessionUser.id,
        email: sessionUser.email,
        emailVerified: sessionUser.emailVerified,
      },
      emailVerificationRequired: !sessionUser.emailVerified,
    };
  }

  const existing = await findUserIdentityByEmail(prisma, email);
  if (existing) {
    throw conflict(
      existing.emailVerified
        ? "An account with this email already exists. Please log in and submit the application while signed in."
        : "An account with this email already exists but is not verified. Verify your email, log in, then submit the application.",
      {
        code: existing.emailVerified
          ? "LOGIN_REQUIRED"
          : "EMAIL_VERIFICATION_REQUIRED",
      },
    );
  }

  if (!input.password) {
    throw badRequest(
      "Password is required to create an account for a new applicant",
      { code: "PASSWORD_REQUIRED" },
    );
  }

  const plainOtp = generateOTP();
  const hashedPassword = await hashPassword(input.password);

  return {
    identity: {
      kind: "create",
      email,
      name: input.fullName,
      hashedPassword,
      otpHash: hashOTP(plainOtp),
      verificationExpires: new Date(Date.now() + TTL.OTP),
    },
    emailVerificationRequired: true,
    plainOtp,
  };
}

export const registerApplicantService = async (
  prisma: PrismaClient,
  input: CreateApplicantInput,
  sessionUserId?: string,
): Promise<ApplicantResponse> => {
  const email = normalizeEmail(input.email);
  input = { ...input, email };

  const existingApplicant = await findApplicantByEmail(prisma, email);
  if (existingApplicant) {
    if (
      sessionUserId &&
      existingApplicant.userId === sessionUserId &&
      existingApplicant.studentProfile
    ) {
      return formatApplicantResponse(existingApplicant);
    }
    throw conflict("An application with this email already exists", {
      code: "APPLICANT_ALREADY_EXISTS",
    });
  }

  const { identity, emailVerificationRequired, plainOtp } =
    await resolveIdentity(prisma, input, sessionUserId);

  const applicant = await createApplicantWithProfile(prisma, input, identity);

  if (identity.kind === "create" && plainOtp) {
    enqueueAuthEmail({
      type: "welcome",
      to: identity.email,
      name: identity.name || "there",
      code: plainOtp,
    }).catch((err: unknown) => {
      logger.error("INTAKE_WELCOME_EMAIL_ENQUEUE_FAILED", {
        email: identity.email,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return formatApplicantResponse(applicant, { emailVerificationRequired });
};

export const getApplicantService = async (
  prisma: PrismaClient,
  id: string,
): Promise<ApplicantResponse> => {
  const applicant = await getApplicantById(prisma, id);
  if (!applicant) throw badRequest("Applicant not found");
  return formatApplicantResponse(applicant);
};

export const listApplicantsService = async (
  prisma: PrismaClient,
  query: ListApplicantsQuery,
) => {
  const page = query.page || 1;
  const limit = query.limit || 10;
  const result = await listApplicants(prisma, { ...query, page, limit });
  return {
    data: result.data.map((a) => formatApplicantResponse(a)),
    pagination: result.pagination,
  };
};

export const updateApplicantService = async (
  prisma: PrismaClient,
  id: string,
  input: UpdateApplicantInput,
): Promise<ApplicantResponse> => {
  const existing = await getApplicantById(prisma, id);
  if (!existing) throw badRequest("Applicant not found");

  if (input.email && normalizeEmail(input.email) !== existing.email) {
    const duplicate = await existsByEmail(prisma, normalizeEmail(input.email));
    if (duplicate) {
      throw conflict("Email already in use", { code: "EMAIL_ALREADY_IN_USE" });
    }
  }

  await updateApplicant(prisma, id, input);
  const fullUpdated = await getApplicantById(prisma, id);
  return formatApplicantResponse(fullUpdated!);
};

export const updateApplicantStatusService = async (
  prisma: PrismaClient,
  id: string,
  newStatus: ApplicantStatus,
  _adminId: string,
): Promise<ApplicantResponse> => {
  const applicant = await getApplicantById(prisma, id);
  if (!applicant) throw badRequest("Applicant not found");
  await updateApplicantStatus(prisma, id, newStatus);
  const fullUpdated = await getApplicantById(prisma, id);
  return formatApplicantResponse(fullUpdated!);
};

export const deleteApplicantService = async (
  prisma: PrismaClient,
  id: string,
): Promise<{ success: boolean }> => {
  const applicant = await getApplicantById(prisma, id);
  if (!applicant) throw badRequest("Applicant not found");
  await deleteApplicant(prisma, id);
  return { success: true };
};

export const getStatsService = async (prisma: PrismaClient) => {
  const countByStatus = await getCountByStatus(prisma);
  const stats = {
    total: 0,
    pending: 0,
    reviewed: 0,
    approved: 0,
    rejected: 0,
  };
  countByStatus.forEach((item) => {
    stats.total += item._count;
    const key = item.status.toLowerCase() as keyof typeof stats;
    if (key in stats) stats[key] = item._count;
  });
  return stats;
};
