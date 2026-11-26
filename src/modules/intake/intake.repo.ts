import {
  PrismaClient,
  ApplicantStatus,
  StudentRegistrationSource,
  StudentStatus,
  type Prisma,
} from "@prisma/client";
import {
  CreateApplicantInput,
  UpdateApplicantInput,
  ListApplicantsQuery,
  PaginatedResponse,
} from "./intake.types";

type Tx = Prisma.TransactionClient;

const applicantDetailSelect = {
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
  userId: true,
  cohortOfferId: true,
  approvedAt: true,
  autoApproved: true,
  createdAt: true,
  updatedAt: true,
  papers: { select: { id: true, paperName: true } },
  employment: {
    select: { id: true, placeOfWork: true, position: true },
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
  studentProfile: {
    select: {
      id: true,
      status: true,
      registrationSource: true,
      userId: true,
    },
  },
} satisfies Prisma.ApplicantSelect;

export type ApplicantDetail = Prisma.ApplicantGetPayload<{
  select: typeof applicantDetailSelect;
}>;

/**
 * Applicant (PENDING) + StudentProfile (ACTIVE) for an ALREADY VERIFIED user.
 * Runs inside the caller's transaction so pending-registration finalization
 * can create User + Applicant + StudentProfile atomically.
 * Never creates CohortMember or Enrollment. An existing profile's status is
 * never changed here (a SUSPENDED student is not reactivated by applying).
 */
export async function insertApplicantWithProfile(
  tx: Tx,
  data: CreateApplicantInput,
  userId: string,
): Promise<ApplicantDetail> {
  const existingProfile = await tx.studentProfile.findUnique({
    where: { userId },
    select: { id: true, applicantId: true },
  });

  if (existingProfile?.applicantId) {
    const existingApplicant = await tx.applicant.findUnique({
      where: { id: existingProfile.applicantId },
      select: applicantDetailSelect,
    });
    if (existingApplicant) return existingApplicant;
  }

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
      userId,
      cohortOfferId: data.cohortOfferId || null,
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
    select: { id: true },
  });

  await tx.studentProfile.upsert({
    where: { userId },
    create: {
      userId,
      applicantId: applicant.id,
      registrationSource: StudentRegistrationSource.APPLICATION,
      status: StudentStatus.ACTIVE,
    },
    update: {
      applicantId: applicant.id,
      registrationSource: StudentRegistrationSource.APPLICATION,
    },
  });

  const full = await tx.applicant.findUnique({
    where: { id: applicant.id },
    select: applicantDetailSelect,
  });
  if (!full) throw new Error("APPLICANT_CREATE_FAILED");
  return full;
}

export async function createApplicantWithProfile(
  prisma: PrismaClient,
  data: CreateApplicantInput,
  userId: string,
): Promise<ApplicantDetail> {
  return prisma.$transaction((tx) => insertApplicantWithProfile(tx, data, userId));
}

export async function getApplicantById(prisma: PrismaClient, id: string) {
  return prisma.applicant.findUnique({
    where: { id },
    select: applicantDetailSelect,
  });
}

export async function existsByEmail(
  prisma: PrismaClient,
  email: string,
): Promise<boolean> {
  const result = await prisma.applicant.findFirst({
    where: { email },
    select: { id: true },
  });
  return !!result;
}

export async function findApplicantByEmail(
  prisma: PrismaClient,
  email: string,
): Promise<ApplicantDetail | null> {
  return prisma.applicant.findFirst({
    where: { email },
    select: applicantDetailSelect,
  });
}

export async function listApplicants(
  prisma: PrismaClient,
  query: ListApplicantsQuery & { page: number; limit: number },
): Promise<PaginatedResponse<ApplicantDetail>> {
  const skip = (query.page - 1) * query.limit;
  const where: Prisma.ApplicantWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.search) {
    where.OR = [
      { fullName: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
      { phone: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.ApplicantOrderByWithRelationInput = {};
  if (query.sortBy) orderBy[query.sortBy] = query.sortOrder ?? "desc";

  const [applicants, total] = await Promise.all([
    prisma.applicant.findMany({
      where,
      select: applicantDetailSelect,
      skip,
      take: query.limit,
      orderBy,
    }),
    prisma.applicant.count({ where }),
  ]);

  return {
    data: applicants,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}

export async function updateApplicant(
  prisma: PrismaClient,
  id: string,
  data: UpdateApplicantInput,
) {
  return prisma.$transaction(async (tx: Tx) => {
    const { employment, sponsor, papers, ...mainData } = data;
    const applicant = await tx.applicant.update({ where: { id }, data: mainData });

    if (employment !== undefined) {
      const existingEmployment = await tx.employmentInfo.findUnique({
        where: { applicantId: id },
      });
      if (existingEmployment) {
        await tx.employmentInfo.update({
          where: { id: existingEmployment.id },
          data: employment,
        });
      } else if (Object.values(employment).some((v) => v !== undefined)) {
        await tx.employmentInfo.create({
          data: { applicantId: id, ...employment },
        });
      }
    }

    if (sponsor !== undefined) {
      const existingSponsor = await tx.sponsorInfo.findUnique({
        where: { applicantId: id },
      });
      if (existingSponsor) {
        await tx.sponsorInfo.update({
          where: { id: existingSponsor.id },
          data: sponsor,
        });
      } else if (Object.values(sponsor).some((v) => v !== undefined)) {
        await tx.sponsorInfo.create({
          data: { applicantId: id, ...sponsor },
        });
      }
    }

    if (papers !== undefined && Array.isArray(papers)) {
      await tx.applicantPaper.deleteMany({ where: { applicantId: id } });
      if (papers.length > 0) {
        await tx.applicantPaper.createMany({
          data: papers.map((paperName) => ({ applicantId: id, paperName })),
        });
      }
    }

    return applicant;
  });
}

export async function updateApplicantStatus(
  prisma: PrismaClient,
  id: string,
  status: ApplicantStatus,
) {
  const data: Prisma.ApplicantUpdateInput = { status };
  if (status === ApplicantStatus.APPROVED) {
    data.approvedAt = new Date();
  }
  return prisma.applicant.update({
    where: { id },
    data,
    select: { id: true, email: true, status: true, updatedAt: true },
  });
}

export async function deleteApplicant(prisma: PrismaClient, id: string) {
  return prisma.applicant.delete({
    where: { id },
    select: { id: true },
  });
}

export async function getCountByStatus(prisma: PrismaClient) {
  return prisma.applicant.groupBy({
    by: ["status"],
    _count: true,
  });
}

export async function findUserIdentityByEmail(
  prisma: PrismaClient,
  email: string,
) {
  return prisma.user.findUnique({
    where: { email, deletedAt: null },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      name: true,
      studentProfile: { select: { id: true, status: true, applicantId: true } },
    },
  });
}

export async function findUserIdentityById(prisma: PrismaClient, id: string) {
  return prisma.user.findUnique({
    where: { id, deletedAt: null },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      name: true,
      studentProfile: { select: { id: true, status: true, applicantId: true } },
    },
  });
}
