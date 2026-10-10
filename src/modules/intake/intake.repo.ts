import { PrismaClient, Applicant, ApplicantStatus } from '@prisma/client';
import { CreateApplicantInput, UpdateApplicantInput, ListApplicantsQuery, PaginatedResponse } from './intake.types';

// =============================================================================
// Intake Repository Functions (Functional Style)
// =============================================================================

/**
 * Create applicant with nested employment, sponsor, and papers in a transaction.
 * This ensures atomic operation - either all succeed or all fail.
 */
export async function createApplicant(
  prisma: PrismaClient,
  data: CreateApplicantInput
): Promise<Applicant> {
  return prisma.$transaction(async (tx) => {
    const applicant = await tx.applicant.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        address: data.address,
        lectureCenter: data.lectureCenter || null,
        previousCenter: data.previousCenter || null,
        isNewStudent: data.isNewStudent,
        level: data.level || null,
        careerChallenges: data.careerChallenges || null,
        referredBy: data.referredBy || null,
        documents: data.documents || [],
        status: ApplicantStatus.PENDING,
        // Nested creates
        papers: {
          createMany: {
            data: data.papers.map((paperName) => ({ paperName })),
          },
        },
        employment: data.employment
          ? {
              create: {
                placeOfWork: data.employment.placeOfWork || null,
                position: data.employment.position || null,
              },
            }
          : undefined,
        sponsor: data.sponsor
          ? {
              create: {
                name: data.sponsor.name || null,
                phone: data.sponsor.phone || null,
                email: data.sponsor.email || null,
                location: data.sponsor.location || null,
                workplace: data.sponsor.workplace || null,
              },
            }
          : undefined,
      },
    });

    return applicant;
  });
}

/**
 * Get single applicant with all relations.
 * Uses select for efficiency - only fetch needed fields.
 */
export async function getApplicantById(prisma: PrismaClient, id: string) {
  return prisma.applicant.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      address: true,
      lectureCenter: true,
      previousCenter: true,
      isNewStudent: true,
      level: true,
      careerChallenges: true,
      referredBy: true,
      documents: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      papers: {
        select: {
          id: true,
          paperName: true,
        },
      },
      employment: {
        select: {
          id: true,
          placeOfWork: true,
          position: true,
        },
      },
      sponsor: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          location: true,
          workplace: true,
        },
      },
    },
  });
}

/**
 * Check if applicant exists by email (for duplicate prevention).
 */
export async function existsByEmail(
  prisma: PrismaClient,
  email: string
): Promise<boolean> {
  const result = await prisma.applicant.findFirst({
    where: { email },
    select: { id: true },
  });
  return !!result;
}

/**
 * List applicants with filters and pagination.
 * Includes optional search and status filtering.
 */
export async function listApplicants(
  prisma: PrismaClient,
  query: ListApplicantsQuery & { page: number; limit: number }
): Promise<PaginatedResponse<Applicant>> {
  const skip = (query.page - 1) * query.limit;

  // Build where clause
  const where: any = {};

  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    where.OR = [
      { fullName: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
      { phone: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  // Build order by
  const orderBy: any = {};
  if (query.sortBy) {
    orderBy[query.sortBy] = query.sortOrder;
  }

  // Fetch data and count in parallel
  const [applicants, total] = await Promise.all([
    prisma.applicant.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        address: true,
        lectureCenter: true,
        previousCenter: true,
        isNewStudent: true,
        level: true,
        careerChallenges: true,
        referredBy: true,
        documents: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        papers: {
          select: {
            id: true,
            paperName: true,
          },
        },
        employment: {
          select: {
            id: true,
            placeOfWork: true,
            position: true,
          },
        },
        sponsor: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            location: true,
            workplace: true,
          },
        },
      },
      skip,
      take: query.limit,
      orderBy,
    }),
    prisma.applicant.count({ where }),
  ]);

  const pages = Math.ceil(total / query.limit);

  return {
    data: applicants,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages,
    },
  };
}

/**
 * Update applicant with partial data.
 * Handles nested updates carefully.
 */
export async function updateApplicant(
  prisma: PrismaClient,
  id: string,
  data: UpdateApplicantInput
) {
  return prisma.$transaction(async (tx) => {
    // Update main applicant fields
    const { employment, sponsor, papers, ...mainData } = data;

    const applicant = await tx.applicant.update({
      where: { id },
      data: mainData,
    });

    // Update employment if provided
    if (employment !== undefined) {
      const existingEmployment = await tx.employmentInfo.findUnique({
        where: { applicantId: id },
      });

      if (existingEmployment) {
        await tx.employmentInfo.update({
          where: { id: existingEmployment.id },
          data: employment,
        });
      } else if (Object.values(employment).some((value) => value !== undefined)) {
        await tx.employmentInfo.create({
          data: {
            applicantId: id,
            ...employment,
          },
        });
      }
    }

    // Update sponsor if provided
    if (sponsor !== undefined) {
      const existingSponsor = await tx.sponsorInfo.findUnique({
        where: { applicantId: id },
      });

      if (existingSponsor) {
        await tx.sponsorInfo.update({
          where: { id: existingSponsor.id },
          data: sponsor,
        });
      } else if (Object.values(sponsor).some((value) => value !== undefined)) {
        await tx.sponsorInfo.create({
          data: {
            applicantId: id,
            ...sponsor,
          },
        });
      }
    }

    // Update papers if provided
    if (papers !== undefined && Array.isArray(papers)) {
      // Delete existing papers
      await tx.applicantPaper.deleteMany({
        where: { applicantId: id },
      });

      // Create new papers
      if (papers.length > 0) {
        await tx.applicantPaper.createMany({
          data: papers.map((paperName) => ({
            applicantId: id,
            paperName,
          })),
        });
      }
    }

    return applicant;
  });
}

/**
 * Update applicant status only.
 */
export async function updateApplicantStatus(
  prisma: PrismaClient,
  id: string,
  status: ApplicantStatus
) {
  return prisma.applicant.update({
    where: { id },
    data: { status },
    select: {
      id: true,
      email: true,
      status: true,
      updatedAt: true,
    },
  });
}

/**
 * Delete applicant and all related data (cascades handled by database).
 */
export async function deleteApplicant(prisma: PrismaClient, id: string) {
  return prisma.applicant.delete({
    where: { id },
    select: { id: true },
  });
}

/**
 * Get applicant count by status (useful for dashboard).
 */
export async function getCountByStatus(prisma: PrismaClient) {
  return prisma.applicant.groupBy({
    by: ['status'],
    _count: true,
  });
}