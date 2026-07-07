import { badRequest, notFound, unauthorized } from "@/utils/errors";
import { ProgressRepo } from "./progress.repo";

/** Verify the enrollment belongs to the requesting user and is not expired. */
export async function assertEnrollmentOwnership(
    enrollmentId: string,
    userId: string
) {
    const enrollment = await ProgressRepo.findEnrollmentById(enrollmentId);

    if (!enrollment) {
        throw notFound("Enrollment not found.");
    }
    if (enrollment.userId !== userId) {
        throw unauthorized("You do not have access to this enrollment.");
    }
    if (enrollment.expiresAt && enrollment.expiresAt < new Date()) {
        throw badRequest("Enrollment has expired.");
    }

    return enrollment;
}

export async function assertTopicInCourse(topicId: string, courseId: string) {
    const topic = await ProgressRepo.topicExistsInCourse(topicId, courseId);

    if (!topic) {
        throw badRequest("Topic not part of course");
    }

    return topic;
}

/** Verify the topic belongs to a module inside the given enrollment's course. */
// async function assertTopicBelongsToEnrollment(
//     topicId: string,
//     enrollmentId: string
// ): Promise<void> {
//     const enrollment = await ProgressRepo.topicExistsInCourse(topicId, course)

//     await ProgressRepo.enrollment.findUnique({
//         where: { id: enrollmentId },
//         select: {
//             course: {
//                 select: {
//                     modules: {
//                         select: { topics: { select: { id: true } } },
//                     },
//                 },
//             },
//         },
//     });

//     const topicIds = enrollment?.course.modules
//         .flatMap((m) => m.topics)
//         .map((t) => t.id) ?? [];

//     if (!topicIds.includes(topicId)) {
//         throw badRequest("Topic does not belong to this enrollment's course.");
//     }
// }