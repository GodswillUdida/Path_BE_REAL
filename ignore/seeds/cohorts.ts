import {
  CohortMemberSource,
  CohortMemberStatus,
  CohortStatus,
  EnrollmentSource,
  EnrollmentStatus,
  PaymentStatus,
  type Prisma,
} from "@prisma/client";
import type { CourseSeedMeta } from "./courses";
import type { SeedUsers } from "./users";

export type SeedCohortResult = {
  cohortId: string;
  offerId: string;
  orderId: string;
  orderItemId: string;
  courseIds: string[];
  /** First COHORT_SEAT enrollment created in this seed (if any). */
  seatEnrollmentId: string | null;
};

/**
 * One ACTIVE cohort with an offer, one paid seat for testUser,
 * bundled COHORT_SEAT enrollments for the cohort's courses.
 * Returns ids so live sessions / announcements / chat can attach.
 */
export async function seedCohorts(
  tx: Prisma.TransactionClient,
  users: SeedUsers,
  createdCourses: CourseSeedMeta[],
): Promise<SeedCohortResult | null> {
  const { testUser, admin, instructor } = users;

  const basics = createdCourses.find((c) => c.course.slug === "accounting-basics");
  const analysis = createdCourses.find((c) => c.course.slug === "financial-analysis");
  if (!basics || !analysis) return null;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 90 * 24 * 60 * 60 * 1000);
  const courseIds = [basics.course.id, analysis.course.id];

  const cohort = await tx.cohort.create({
    data: {
      name: "Lagos Diploma Batch A",
      slug: "lagos-diploma-batch-a",
      description: "Physical + live cohort for diploma track",
      centre: "Lagos",
      status: CohortStatus.ACTIVE,
      startsAt,
      endsAt,
      capacity: 40,
      createdById: admin.id,
      courses: {
        create: courseIds.map((courseId) => ({ courseId })),
      },
      instructors: {
        create: [{ userId: instructor.id }],
      },
      offers: {
        create: [
          {
            name: "Full seat",
            price: 150_000,
            currency: "NGN",
            includesCourseAccess: true,
            bonusDays: 30,
            isActive: true,
            sortOrder: 1,
          },
        ],
      },
    },
    include: { offers: true },
  });

  const offer = cohort.offers[0];
  const memberExpiresAt = endsAt;
  const contentExpiresAt = new Date(
    endsAt.getTime() + offer.bonusDays * 24 * 60 * 60 * 1000,
  );

  const order = await tx.order.create({
    data: {
      userId: testUser.id,
      email: testUser.email,
      name: testUser.name,
      totalAmount: offer.price,
      isFreeOrder: false,
      currency: "NGN",
      status: PaymentStatus.PAID,
    },
  });

  const orderItem = await tx.orderItem.create({
    data: {
      orderId: order.id,
      cohortOfferId: offer.id,
      unitPrice: offer.price,
      quantity: 1,
      bonusDays: offer.bonusDays,
    },
  });

  await tx.cohortMember.create({
    data: {
      cohortId: cohort.id,
      userId: testUser.id,
      status: CohortMemberStatus.ACTIVE,
      source: CohortMemberSource.PURCHASE,
      orderItemId: orderItem.id,
      expiresAt: memberExpiresAt,
    },
  });

  let seatEnrollmentId: string | null = null;

  for (const courseId of courseIds) {
    // Avoid unique (userId, courseId) clash if a PURCHASE row already exists
    const existing = await tx.enrollment.findUnique({
      where: { userId_courseId: { userId: testUser.id, courseId } },
      select: { id: true },
    });
    if (existing) continue;

    const created = await tx.enrollment.create({
      data: {
        userId: testUser.id,
        courseId,
        source: EnrollmentSource.COHORT_SEAT,
        cohortId: cohort.id,
        status: EnrollmentStatus.ACTIVE,
        startedAt: startsAt,
        expiresAt: contentExpiresAt,
        progressPercentage: 0,
      },
      select: { id: true },
    });

    if (!seatEnrollmentId) seatEnrollmentId = created.id;
  }

  console.log("✅ Cohort + offer + seat member seeded");

  return {
    cohortId: cohort.id,
    offerId: offer.id,
    orderId: order.id,
    orderItemId: orderItem.id,
    courseIds,
    seatEnrollmentId,
  };
}