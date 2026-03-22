// enrollment.service.ts
// Production-ready — March 2026
// Only query logic remains. Creation now happens atomically in payment webhook
// (fulfillOrderAfterPayment) to guarantee Order = intent → Payment = money → Enrollment = access.

import prisma from "../../lib/prisma";
import { notFound, forbidden } from "../../utils/errors";

const enrollmentIncludes = {
  user: true,
  course: {
    include: {
      pricings: true,
      modules: {
        include: { topics: true },
      },
    },
  },
  pricing: true,
  progressRecords: true,
  certificate: true,
  payments: true,
  orderItem: true,
  order: true,
} as const;


export async function getUserEnrollmentsService(userId: string) {
  return prisma.enrollment.findMany({
    where: { userId },
    include: enrollmentIncludes,
    orderBy: { startedAt: "desc" },
  });
}

export async function getOneEnrollmentService(id: string, userId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
    include: enrollmentIncludes,
  });

  if (!enrollment) throw notFound("Enrollment not found");
  if (enrollment.userId !== userId) {
    throw forbidden("Access denied — this enrollment belongs to another user");
  }

  return enrollment;
}
