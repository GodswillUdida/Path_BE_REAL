import prisma from "../../lib/prisma";
import { notFound, forbidden } from "../../utils/errors";
// import {
//   sendPhysicalEnrollmentEmail,
//   notifyAdminPhysicalEnrollment,
// } from "../../services/emailService";
import { EnrollmentRequestInput } from "./enrollmentRequest.schema";

export async function createPhysicalEnrollmentRequestService(
  data: EnrollmentRequestInput
) {
  const { courseId, programId } = data;

  // Course validation (physical only)
  if (courseId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, type: true, programId: true, title: true },
    });

    if (!course) throw notFound("Course not found");
    if (course.type !== "physical")
      throw forbidden("This course requires full online enrollment");

    if (programId && course.programId !== programId)
      throw forbidden("Course does not belong to this program");
  }

  const request = await prisma.enrollmentRequest.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      courseId: data.courseId ?? null,
      notes: data.notes ?? null,
      status: "PENDING",
    },
  });

  // Fire and forget emails
  //   try {
  //     await Promise.all([
  //       sendPhysicalEnrollmentEmail(data.email, {
  //         name: data.name,
  //         courseId: data.courseId,
  //       }),
  //       notifyAdminPhysicalEnrollment({
  //         name: data.name,
  //         email: data.email,
  //       }),
  //     ]);
  //   } catch (err) {
  //     console.error("Email error:", err);
  //   }

  return request;
}

export async function listPhysicalEnrollmentRequestsService() {
    const requests = await prisma.enrollmentRequest.findMany({
        where: { courseId: { not: null } }, 
        orderBy: { createdAt: "desc" },
    });
    return requests;
}

