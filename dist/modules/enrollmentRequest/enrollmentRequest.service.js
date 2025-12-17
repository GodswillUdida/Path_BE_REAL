"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPhysicalEnrollmentRequestService = createPhysicalEnrollmentRequestService;
exports.listPhysicalEnrollmentRequestsService = listPhysicalEnrollmentRequestsService;
exports.getSingleEnrollmentRequestService = getSingleEnrollmentRequestService;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const errors_1 = require("../../utils/errors");
// import { EnrollmentRequestInput } from "./enrollmentRequest.schema";
async function createPhysicalEnrollmentRequestService(courseId, data) {
    const course = await prisma_1.default.course.findUnique({
        where: { id: courseId },
        select: { id: true, type: true, programId: true, title: true },
    });
    if (!course)
        throw (0, errors_1.notFound)("Course not found");
    if (course.type !== "physical")
        throw (0, errors_1.forbidden)("This course is not available for physical enrollment");
    const request = await prisma_1.default.enrollmentRequest.create({
        data: {
            name: data.name,
            email: data.email,
            phone: data.phone,
            courseId: data.courseId || courseId,
            notes: data.notes ?? null,
            status: "REGISTERED",
        },
    });
    return { ...request, courseId: course.title };
}
async function listPhysicalEnrollmentRequestsService() {
    const requests = await prisma_1.default.enrollmentRequest.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            course: {
                select: {
                    title: true,
                    slug: true,
                    type: true,
                },
            },
        },
    });
    if (!requests)
        throw (0, errors_1.notFound)("Error Listing all enrollment");
    return requests;
}
async function getSingleEnrollmentRequestService(id) {
    const request = await prisma_1.default.enrollmentRequest.findUnique({
        where: { id },
        include: {
            course: {
                select: {
                    title: true,
                    slug: true,
                    type: true,
                },
            },
        },
    });
    if (!request)
        throw (0, errors_1.notFound)("Enrollment request not found");
    return request;
}
