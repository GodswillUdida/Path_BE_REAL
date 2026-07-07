import { PrismaClient, ApplicantStatus } from '@prisma/client';
// import { Queue } from 'bullmq';
import { createApplicant, deleteApplicant, existsByEmail, getApplicantById, getCountByStatus, listApplicants, updateApplicant, updateApplicantStatus } from './intake.repo';
import { CreateApplicantInput, UpdateApplicantInput, ListApplicantsQuery, ApplicantResponse } from './intake.types';

/**
 * Format applicant database record to response format.
 */
const formatApplicantResponse = (applicant: any): ApplicantResponse => {
  return {
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
    createdAt: applicant.createdAt,
    updatedAt: applicant.updatedAt,
    papers: applicant.papers || [],
    employment: applicant.employment || undefined,
    sponsor: applicant.sponsor || undefined,
  };
};

/**
 * Register a new applicant.
 * Validates uniqueness, creates applicant, and queues confirmation email.
 */
export const registerApplicantService = async (
  // repo: IntakeRepository,
  prisma: PrismaClient,
  input: CreateApplicantInput,
  // emailQueue?: any,
): Promise<ApplicantResponse> => {
  // Check for duplicate email
  const existingApplicant = await existsByEmail(prisma, input.email);
  if (existingApplicant) {
    throw new Error('APPLICANT_ALREADY_EXISTS');
  }

  // Create applicant in database
  const applicant = await createApplicant(prisma, input);

  // Queue confirmation email (non-blocking)
  // await emailQueue.add(
  //   'applicant-registration-confirmation',
  //   {
  //     applicantId: applicant.id,
  //     email: applicant.email,
  //     fullName: applicant.fullName,
  //   },
  //   {
  //     attempts: 3,
  //     backoff: {
  //       type: 'exponential',
  //       delay: 2000,
  //     },
  //   }
  // );

  return formatApplicantResponse(applicant);
};

/**
 * Retrieve a single applicant by ID.
 */
export const getApplicantService = async (prisma: PrismaClient, id: string): Promise<ApplicantResponse> => {
  const applicant = await getApplicantById(prisma, id);

  if (!applicant) {
    throw new Error('APPLICANT_NOT_FOUND');
  }

  return formatApplicantResponse(applicant);
};

/**
 * List applicants with filters and pagination.
 */
export const listApplicantsService = async (prisma: PrismaClient, query: ListApplicantsQuery) => {
  const page = query.page || 1;
  const limit = query.limit || 10;

  const result = await listApplicants(prisma, {
    ...query,
    page,
    limit,
  });

  return {
    data: result.data.map((a) => formatApplicantResponse(a)),
    pagination: result.pagination,
  };
};

/**
 * Update applicant information.
 */
export const updateApplicantService = async (
  prisma: PrismaClient,
  id: string,
  input: UpdateApplicantInput
): Promise<ApplicantResponse> => {
  // Verify applicant exists
  const existing = await getApplicantById(prisma, id);
  if (!existing) {
    throw new Error('APPLICANT_NOT_FOUND');
  }

  // If email is being changed, check for duplicates
  if (input.email && input.email !== existing.email) {
    const duplicate = await existsByEmail(prisma, input.email);
    if (duplicate) {
      throw new Error('EMAIL_ALREADY_IN_USE');
    }
  }

  await updateApplicant(prisma, id, input);

  // Fetch full updated record with relations
  const fullUpdated = await getApplicantById(prisma, id);

  return formatApplicantResponse(fullUpdated!);
};

/**
 * Update applicant status (admin action).
 * Triggers email notification when status changes.
 */
export const updateApplicantStatusService = async (
  prisma: PrismaClient,
  id: string,
  newStatus: ApplicantStatus,
  adminId: string,
  // emailQueue?: any,
): Promise<ApplicantResponse> => {
  // Verify applicant exists and fetch current state
  const applicant = await getApplicantById(prisma, id);
  if (!applicant) {
    throw new Error('APPLICANT_NOT_FOUND');
  }

  const currentStatus = applicant.status;

  // Update status
  await updateApplicantStatus(prisma, id, newStatus);

  // Queue status change email if status actually changed
  // if (currentStatus !== newStatus) {
  //   await emailQueue.add(
  //     'applicant-status-changed',
  //     {
  //       applicantId: id,
  //       email: applicant.email,
  //       fullName: applicant.fullName,
  //       previousStatus: currentStatus,
  //       newStatus: newStatus,
  //       adminId: adminId,
  //     },
  //     {
  //       attempts: 3,
  //       backoff: {
  //         type: 'exponential',
  //         delay: 2000,
  //       },
  //     }
  //   );
  // }

  // Fetch and return updated full record
  const fullUpdated = await getApplicantById(prisma, id);

  return formatApplicantResponse(fullUpdated!);
};

/**
 * Delete applicant and all related data.
 */
//  (async (req: Request, res: Response) => {
export const deleteApplicantService = async (
  prisma: PrismaClient  ,
  id: string,
  // emailQueue?: any
): Promise<{ success: boolean }> => {
  const applicant = await getApplicantById(prisma, id);
  if (!applicant) {
    throw new Error('APPLICANT_NOT_FOUND');
  }

  await deleteApplicant(prisma, id);

  // Queue deletion notification
  // await emailQueue.add('applicant-deleted', {
  //   email: applicant.email,
  //   fullName: applicant.fullName,
  // });

  return { success: true };
};

/**
 * Get summary stats for admin dashboard.
 */
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
    stats[item.status.toLowerCase() as keyof typeof stats] = item._count;
  });

  return stats;
};