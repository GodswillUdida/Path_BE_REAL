// certificate.repo.ts
import prisma from "@/lib/prisma";

export const CertificateRepo = {
    findByEnrollment(enrollmentId: string) {
        return prisma.certificate.findUnique({
            where: { enrollmentId },
        });
    },

    findByVerification(verification: string) {
        return prisma.certificate.findUnique({
            where: { verification },
        });
    },

    create(data: {
        enrollmentId: string;
        url: string;
        verification: string;
        courseTitleAtIssuance: string;
    }) {
        return prisma.certificate.create({
            data,
        });
    },

    getCertificates(userId: string) {
        return prisma.certificate.findMany({
            where: {
                enrollment: { userId },
            },
            include: {
                enrollment: {
                    include: {
                        course: true,
                    },
                },
            },
        });
    },

    findEnrollmentWithCourse(enrollmentId: string) {
        return prisma.enrollment.findUnique({
            where: { id: enrollmentId },
            include: {
                course: {
                    select: { title: true },
                },
                progressRecords: true,
            },
        });
    },
};