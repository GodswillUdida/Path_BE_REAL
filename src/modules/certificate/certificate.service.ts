// certificate.service.ts
import prisma from "@/lib/prisma";
import { CertificateRepo } from "./certificate.repo";
import { generateVerificationCode } from "./certificate.utils";
import { badRequest, notFound } from "@/utils/errors";

export const CertificateService = {
    /**
     * Issue certificate ONLY if:
     * - enrollment exists
     * - not already issued
     * - course is completed
     */
    async issueCertificate(enrollmentId: string) {
        const existing = await CertificateRepo.findByEnrollment(enrollmentId);

        if (existing) {
            return existing; // idempotent behavior (important in distributed systems)
        }

        const enrollment = await CertificateRepo.findEnrollmentWithCourse(enrollmentId);

        if (!enrollment) {
            throw notFound("Enrollment not found");
        }

        // 🚨 Completion check (IMPORTANT)
        const totalTopics = await prisma.topic.count({
            where: { module: { courseId: enrollment.courseId } },
        });

        const completedTopics = enrollment.progressRecords.filter(
            (p) => p.completed
        ).length;

        if (completedTopics < totalTopics) {
            throw badRequest("Course not completed yet");
        }

        const verification = generateVerificationCode();

        // 🔥 You should generate URL via storage service (S3/Bunny/R2)
        const certificateUrl = `https://cdn.yourapp.com/certificates/${verification}.pdf`;

        return CertificateRepo.create({
            enrollmentId,
            url: certificateUrl,
            verification,
            courseTitleAtIssuance: enrollment.course.title,
        });
    },

    async verifyCertificate(verification: string) {
        const cert = await CertificateRepo.findByVerification(verification);

        if (!cert) {
            throw notFound("Invalid certificate");
        }

        return cert;
    },

    async getCertificateByEnrollment(enrollmentId: string) {
        return CertificateRepo.findByEnrollment(enrollmentId);
    },

    async getMyCertificates(userId: string) {
        return CertificateRepo.getCertificates(userId);
    }
};