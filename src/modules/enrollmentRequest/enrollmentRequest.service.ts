// import prisma from "../../lib/prisma";
// import { notFound, forbidden } from "../../utils/errors";
// // import { EnrollmentRequestInput } from "./enrollmentRequest.schema";

// export async function createPhysicalEnrollmentRequestService(
//   courseId: string,
//   data: {
//     name: string;
//     email: string;
//     phone: string;
//     notes?: string;
//     courseId?: string;
//   }
// ) {
//   const course = await prisma.course.findUnique({
//     where: { id: courseId },
//     select: { id: true, type: true, programId: true, title: true },
//   });

//   if (!course) throw notFound("Course not found");
//   if (course.type !== "physical")
//     throw forbidden("This course is not available for physical enrollment");

//   const request = await prisma.enrollmentRequest.create({
//     data: {
//       name: data.name,
//       email: data.email,
//       phone: data.phone,
//       courseId: data.courseId || courseId,
//       notes: data.notes ?? null,
//       status: "REGISTERED",
//     },
//   });

//   return {...request, courseId: course.title };
// }

// export async function listPhysicalEnrollmentRequestsService() {
//   const requests = await prisma.enrollmentRequest.findMany({
//     orderBy: { createdAt: "desc" },
//     include: {
//       course: {
//         select: {
//           title: true,
//           slug: true,
//           type: true,
//         },
//       },
//     },
//   });


//   if (!requests) throw notFound("Error Listing all enrollment"); 
//   return requests;
// }

// export async function getSingleEnrollmentRequestService(id: string) {
//   const request = await prisma.enrollmentRequest.findUnique({
//     where: { id },
//     include: {
//       course: {
//         select: {
//           title: true,
//           slug: true,
//           type: true,
//         },
//       },
//     },
//   });

//   if (!request) throw notFound("Enrollment request not found");
//   return request;
// }
