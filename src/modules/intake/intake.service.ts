import { PrismaClient, ApplicantStatus } from "@prisma/client";
import {
  createApplicantWithProfile,
  deleteApplicant,
  existsByEmail,
  findApplicantByEmail,
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
} from "./intake.types";
import { badRequest, conflict, forbidden, unauthorized } from "@/utils/errors";

import { startPendingRegistration, type PendingStarted } from "./pending-registration.service";

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

export type RegisterOutcome =
  | { kind: "registered"; applicant: ApplicantResponse }
  | { kind: "pending"; pending: PendingStarted };

/**
 * Signed-in applicant: identity is already proven, so the application is
 * finalized immediately. Anonymous applicant: only a PendingRegistration is
 * created; the User/Applicant/StudentProfile are created after the emailed
 * code is verified (see pending-registration.service.ts).
 */
export const registerApplicantService = async (
  prisma: PrismaClient,
  input: CreateApplicantInput,
  ctx: { sessionUserId?: string; ipAddress?: string } = {},
): Promise<RegisterOutcome> => {
  const email = normalizeEmail(input.email);
  input = { ...input, email };

  if (!ctx.sessionUserId) {
    return { kind: "pending", pending: await startPendingRegistration(prisma, input, { ipAddress: ctx.ipAddress }) };
  }

  const sessionUser = await findUserIdentityById(prisma, ctx.sessionUserId);
  if (!sessionUser) throw unauthorized("Invalid session");
  if (!sessionUser.emailVerified) {
    throw forbidden("Verify your email before submitting an application");
  }
  if (normalizeEmail(sessionUser.email) !== email) {
    throw badRequest("Application email must match the signed-in account", { code: "EMAIL_MISMATCH" });
  }

  const existingApplicant = await findApplicantByEmail(prisma, email);
  if (existingApplicant) {
    if (existingApplicant.userId === sessionUser.id && existingApplicant.studentProfile) {
      return { kind: "registered", applicant: formatApplicantResponse(existingApplicant) };
    }
    throw conflict("An application with this email already exists", { code: "APPLICANT_ALREADY_EXISTS" });
  }

  const applicant = await createApplicantWithProfile(prisma, input, sessionUser.id);
  return { kind: "registered", applicant: formatApplicantResponse(applicant) };
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
