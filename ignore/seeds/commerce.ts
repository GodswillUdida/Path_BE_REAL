import {
  CourseStatus,
  EnrollmentSource,
  EnrollmentStatus,
  PaymentGateway,
  PaymentStatus,
  type Prisma,
} from "@prisma/client";
import { faker } from "@faker-js/faker";
import { expiresAtFor } from "./helpers";
import type { CourseSeedMeta } from "./courses";
import type { SeedUsers } from "./users";

export async function seedCommerce(
  tx: Prisma.TransactionClient,
  users: SeedUsers,
  createdCourses: CourseSeedMeta[],
) {
  const { testUser, secondStudent, admin } = users;

  // ── Paid PURCHASE ───────────────────────────────────────────────────────
  const paidCourseEntry = createdCourses.find((c) => c.course.slug === "accounting-basics");
  if (paidCourseEntry) {
    const pricing = await tx.coursePricing.findFirst({
      where: {
        courseId: paidCourseEntry.course.id,
        isFree: false,
        accessDurationDays: 30,
      },
    });

    if (pricing) {
      const reference = `PSK_${faker.string.alphanumeric(14).toUpperCase()}`;
      const startedAt = new Date();
      const bonusDays = pricing.bonusDays ?? 0;
      const expiresAt = expiresAtFor(pricing.accessDurationDays, bonusDays, startedAt);

      const order = await tx.order.create({
        data: {
          userId: testUser.id,
          email: testUser.email,
          name: testUser.name,
          totalAmount: pricing.price,
          isFreeOrder: false,
          currency: "NGN",
          status: PaymentStatus.PAID,
        },
      });

      const orderItem = await tx.orderItem.create({
        data: {
          orderId: order.id,
          pricingId: pricing.id,
          unitPrice: pricing.price,
          quantity: 1,
          bonusDays,
        },
      });

      const enrollment = await tx.enrollment.create({
        data: {
          userId: testUser.id,
          courseId: paidCourseEntry.course.id,
          pricingId: pricing.id,
          orderItemId: orderItem.id,
          orderId: order.id,
          source: EnrollmentSource.PURCHASE,
          status: EnrollmentStatus.ACTIVE,
          startedAt,
          expiresAt,
          progressPercentage: faker.number.int({ min: 15, max: 92 }),
        },
      });

      await tx.payment.create({
        data: {
          userId: testUser.id,
          reference,
          gatewayEventId: `evt_${faker.string.alphanumeric(20)}`,
          orderId: order.id,
          amount: pricing.price,
          currency: "NGN",
          status: PaymentStatus.PAID,
          gateway: PaymentGateway.PAYSTACK,
          rawPayload: {
            event: "charge.success",
            data: {
              reference,
              amount: Number(pricing.price) * 100,
              currency: "NGN",
              status: "success",
            },
          },
        },
      });

      if (paidCourseEntry.course.issuesCertificate) {
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { completedAt: new Date(), progressPercentage: 100 },
        });
        await tx.certificate.create({
          data: {
            enrollmentId: enrollment.id,
            url: `https://cdn.academy.com/certificates/${faker.string.uuid()}.pdf`,
            verification: faker.string.alphanumeric(12).toUpperCase(),
            courseTitleAtIssuance: paidCourseEntry.course.title,
          },
        });
        console.log("✅ Certificate seeded");
      }

      console.log("✅ Paid order + enrollment + payment seeded");
    }
  }

  // ── Free PURCHASE (no Payment row) ──────────────────────────────────────
  const freeCourseEntry = createdCourses.find((c) => c.course.slug === "excel-for-accountants");
  if (freeCourseEntry) {
    const freePricing = await tx.coursePricing.findFirst({
      where: { courseId: freeCourseEntry.course.id, isFree: true },
    });

    if (freePricing) {
      const startedAt = new Date();
      const expiresAt = expiresAtFor(freePricing.accessDurationDays, 0, startedAt);

      const freeOrder = await tx.order.create({
        data: {
          userId: secondStudent.id,
          email: secondStudent.email,
          name: secondStudent.name,
          totalAmount: 0,
          isFreeOrder: true,
          currency: "NGN",
          status: PaymentStatus.PAID,
        },
      });

      const freeOrderItem = await tx.orderItem.create({
        data: {
          orderId: freeOrder.id,
          pricingId: freePricing.id,
          unitPrice: 0,
          quantity: 1,
          bonusDays: 0,
        },
      });

      await tx.enrollment.create({
        data: {
          userId: secondStudent.id,
          courseId: freeCourseEntry.course.id,
          pricingId: freePricing.id,
          orderItemId: freeOrderItem.id,
          orderId: freeOrder.id,
          source: EnrollmentSource.PURCHASE,
          status: EnrollmentStatus.ACTIVE,
          startedAt,
          expiresAt,
          progressPercentage: faker.number.int({ min: 5, max: 60 }),
        },
      });

      console.log("✅ Free order + enrollment seeded");
    }
  }

  // ── REVOKED (refunded) ──────────────────────────────────────────────────
  const revokedCourseEntry = createdCourses.find((c) => c.course.slug === "bookkeeping-essentials");
  if (revokedCourseEntry) {
    const pricing = await tx.coursePricing.findFirst({
      where: {
        courseId: revokedCourseEntry.course.id,
        isFree: false,
        accessDurationDays: 7,
      },
    });

    if (pricing) {
      const startedAt = faker.date.recent({ days: 20 });
      const expiresAt = expiresAtFor(pricing.accessDurationDays, 0, startedAt);
      const reference = `PSK_${faker.string.alphanumeric(14).toUpperCase()}`;

      const order = await tx.order.create({
        data: {
          userId: secondStudent.id,
          email: secondStudent.email,
          name: secondStudent.name,
          totalAmount: pricing.price,
          isFreeOrder: false,
          currency: "NGN",
          status: PaymentStatus.REFUNDED,
        },
      });

      const orderItem = await tx.orderItem.create({
        data: {
          orderId: order.id,
          pricingId: pricing.id,
          unitPrice: pricing.price,
          quantity: 1,
          bonusDays: 0,
        },
      });

      await tx.enrollment.create({
        data: {
          userId: secondStudent.id,
          courseId: revokedCourseEntry.course.id,
          pricingId: pricing.id,
          orderItemId: orderItem.id,
          orderId: order.id,
          source: EnrollmentSource.PURCHASE,
          status: EnrollmentStatus.REVOKED,
          startedAt,
          expiresAt,
          progressPercentage: faker.number.int({ min: 0, max: 20 }),
        },
      });

      await tx.payment.create({
        data: {
          userId: secondStudent.id,
          reference,
          gatewayEventId: `evt_${faker.string.alphanumeric(20)}`,
          orderId: order.id,
          amount: pricing.price,
          currency: "NGN",
          status: PaymentStatus.REFUNDED,
          gateway: PaymentGateway.PAYSTACK,
          rawPayload: {
            event: "refund.processed",
            data: { reference, status: "success" },
          },
        },
      });

      console.log("✅ Revoked enrollment seeded");
    }
  }

  // ── Admin audit ─────────────────────────────────────────────────────────
  if (paidCourseEntry) {
    await tx.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: "course.approve",
        targetType: "Course",
        targetId: paidCourseEntry.course.id,
        metadata: {
          previousStatus: CourseStatus.DRAFT,
          newStatus: CourseStatus.PUBLISHED,
        },
      },
    });
    console.log("✅ Admin audit log seeded");
  }
}