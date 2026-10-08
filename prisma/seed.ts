/**
 * prisma/seed.ts
 *
 * Deterministic-enough seed for local / staging.
 * - VideoAssets are created as READY (no worker will process them).
 * - TopicResources are created as READY with realistic storageKey/url/mimeType.
 * - Duration aggregates are computed from real topic durations.
 */

import {
  PrismaClient,
  CourseStatus,
  PaymentStatus,
  EnrollmentStatus,
  Role,
  CourseLevel,
  PaymentGateway,
  ApplicantStatus,
  VideoStatus,
  VideoProvider,
  ResourceType,
  ResourceStatus,
  Prisma,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

let videoCounter = 1;

// ---------------------------------------------------------------------------
// Video asset generation
// ---------------------------------------------------------------------------

const PROVIDER_WEIGHTS: VideoProvider[] = [
  VideoProvider.BUNNY,
  VideoProvider.BUNNY,
  VideoProvider.BUNNY,
  VideoProvider.BUNNY,
  VideoProvider.MUX,
  VideoProvider.AWS,
  VideoProvider.CLOUDFLARE,
];

function providerAssetIdFor(provider: VideoProvider, seq: string): string {
  switch (provider) {
    case VideoProvider.BUNNY:
      return `bvid_${seq}`;
    case VideoProvider.MUX:
      return `mux_${faker.string.alphanumeric(20)}`;
    case VideoProvider.AWS:
      return `s3://lms-video-assets/originals/${seq}.mp4`;
    case VideoProvider.CLOUDFLARE:
      return faker.string.uuid();
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

function generateVideoAsset(
  durationSeconds: number,
): Prisma.VideoAssetCreateWithoutTopicInput {
  const provider = faker.helpers.arrayElement(PROVIDER_WEIGHTS);
  const seq = String(videoCounter++).padStart(4, "0");
  const providerAssetId = providerAssetIdFor(provider, seq);
  const width = faker.helpers.arrayElement([1920, 1280] as const);
  const height = width === 1920 ? 1080 : 720;

  return {
    provider,
    providerAssetId,
    status: VideoStatus.READY,
    durationSeconds,
    thumbnailUrl: `https://picsum.photos/seed/${faker.string.uuid().slice(0, 10)}/400/225`,
    fileSizeBytes: BigInt(
      faker.number.int({ min: 20_000_000, max: 800_000_000 }),
    ),
    width,
    height,
    retryCount: 0,
    idempotencyKey: faker.string.uuid(),
    readyAt: faker.date.recent({ days: 30 }),
  };
}

// ---------------------------------------------------------------------------
// Topic resources
// ---------------------------------------------------------------------------

type ResourceMeta = {
  extension: string;
  mimeType: string;
};

const FILE_RESOURCE_META: Record<
  Exclude<ResourceType, "LINK">,
  ResourceMeta
> = {
  [ResourceType.PDF]: {
    extension: "pdf",
    mimeType: "application/pdf",
  },
  [ResourceType.EXCEL]: {
    extension: "xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  [ResourceType.WORD]: {
    extension: "docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  [ResourceType.TEMPLATE]: {
    extension: "pdf",
    mimeType: "application/pdf",
  },
};

function generateTopicResources(): Prisma.TopicResourceCreateWithoutTopicInput[] {
  // ~60% of topics have no supplementary resources
  if (faker.number.int({ min: 1, max: 10 }) > 4) return [];

  const count = faker.number.int({ min: 1, max: 3 });
  const resources: Prisma.TopicResourceCreateWithoutTopicInput[] = [];

  for (let i = 0; i < count; i++) {
    // Mix LINK + file types
    const isLink = faker.datatype.boolean({ probability: 0.25 });

    if (isLink) {
      resources.push({
        type: ResourceType.LINK,
        title: faker.lorem.words({ min: 2, max: 5 }),
        storageKey: null,
        url: faker.internet.url(),
        mimeType: null,
        sizeBytes: null,
        status: ResourceStatus.READY,
        position: i,
        readyAt: faker.date.recent({ days: 30 }),
      });
      continue;
    }

    const type = faker.helpers.arrayElement([
      ResourceType.PDF,
      ResourceType.EXCEL,
      ResourceType.WORD,
      ResourceType.TEMPLATE,
    ] as const);

    const meta = FILE_RESOURCE_META[type];
    const resourceId = faker.string.uuid();
    const slug = faker.helpers.slugify(faker.lorem.words({ min: 2, max: 4 }));
    const fileName = `${slug}.${meta.extension}`;
    const storageKey = `topics/seed/resources/${resourceId}/${fileName}`;

    resources.push({
      type,
      title: `${faker.lorem.words({ min: 2, max: 4 })} (${type})`,
      storageKey,
      url: `https://pathfinder-pull.b-cdn.net/${storageKey}`,
      mimeType: meta.mimeType,
      sizeBytes: faker.number.int({ min: 50_000, max: 5_000_000 }),
      status: ResourceStatus.READY,
      position: i,
      readyAt: faker.date.recent({ days: 30 }),
    });
  }

  return resources;
}

// ---------------------------------------------------------------------------
// Topics / Modules
// ---------------------------------------------------------------------------

function generateTopics(
  moduleSeq: number,
): Prisma.TopicCreateWithoutModuleInput[] {
  const count = faker.number.int({ min: 3, max: 7 });

  return Array.from({ length: count }, (_, i) => {
    const durationSeconds = faker.number.int({ min: 240, max: 1500 });

    return {
      title: faker.lorem.words({ min: 3, max: 8 }),
      slug: `topic-${moduleSeq}-${i + 1}`,
      position: i + 1,
      durationSeconds,
      videoAsset: { create: generateVideoAsset(durationSeconds) },
      resources: { create: generateTopicResources() },
    };
  });
}

function generateModules(
  courseSeq: number,
): Prisma.ModuleCreateWithoutCourseInput[] {
  const count = faker.number.int({ min: 4, max: 8 });

  return Array.from({ length: count }, (_, i) => ({
    title: faker.lorem.words({ min: 2, max: 6 }),
    slug: `module-${i + 1}`,
    description: faker.lorem.paragraph(),
    position: i + 1,
    topics: { create: generateTopics(courseSeq * 100 + i + 1) },
  }));
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

function generatePricings(
  isFree: boolean,
  includeLifetimeTier = false,
): Prisma.CoursePricingCreateWithoutCourseInput[] {
  if (isFree) {
    return [
      {
        name: "Free Access",
        price: 0,
        isFree: true,
        accessDurationDays: null,
        sortOrder: 1,
      },
    ];
  }

  const tiers: Prisma.CoursePricingCreateWithoutCourseInput[] = [
    {
      name: "7 Days",
      price: faker.number.int({ min: 4500, max: 12000 }),
      accessDurationDays: 7,
      sortOrder: 1,
    },
    {
      name: "30 Days",
      price: faker.number.int({ min: 14000, max: 28000 }),
      accessDurationDays: 30,
      sortOrder: 2,
    },
    {
      name: "90 Days",
      price: faker.number.int({ min: 38000, max: 65000 }),
      accessDurationDays: 90,
      sortOrder: 3,
    },
  ];

  if (includeLifetimeTier) {
    tiers.push({
      name: "Lifetime",
      price: faker.number.int({ min: 85000, max: 150000 }),
      accessDurationDays: null,
      sortOrder: 4,
    });
  }

  return tiers;
}

function expiresAtFor(
  accessDurationDays: number | null,
  from: Date,
): { expiresAt: Date | null } {
  if (accessDurationDays === null) return { expiresAt: null };
  return {
    expiresAt: new Date(
      from.getTime() + accessDurationDays * 24 * 60 * 60 * 1000,
    ),
  };
}

// ---------------------------------------------------------------------------
// Duration aggregates
// ---------------------------------------------------------------------------

async function computeDurationAggregates(
  tx: Prisma.TransactionClient,
  courseId: string,
): Promise<void> {
  const modules = await tx.module.findMany({
    where: { courseId },
    select: {
      id: true,
      topics: { select: { durationSeconds: true } },
    },
  });

  let courseTotal = 0;

  for (const mod of modules) {
    const moduleTotal = mod.topics.reduce(
      (sum, t) => sum + t.durationSeconds,
      0,
    );
    courseTotal += moduleTotal;
    await tx.module.update({
      where: { id: mod.id },
      data: { totalDurationSeconds: moduleTotal },
    });
  }

  await tx.course.update({
    where: { id: courseId },
    data: { totalDurationSeconds: courseTotal },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type CourseSeedMeta = {
  course: {
    id: string;
    title: string;
    slug: string;
    issuesCertificate: boolean;
  };
  isFree: boolean;
  programIdx: number | null;
};

async function main(): Promise<void> {
  console.log("🌱 Starting database seed...");

  await prisma.$transaction(
    async (tx) => {
      // ====================== 1. USERS ======================
      const testUser = await tx.user.upsert({
        where: { email: "test@example.com" },
        update: {},
        create: {
          name: "Test Student",
          email: "test@example.com",
          emailVerified: true,
          role: Role.student,
          profileImage: "https://randomuser.me/api/portraits/men/32.jpg",
        },
      });

      const secondStudent = await tx.user.upsert({
        where: { email: "jane.student@example.com" },
        update: {},
        create: {
          name: "Jane Adeyemi",
          email: "jane.student@example.com",
          emailVerified: true,
          role: Role.student,
          profileImage: "https://randomuser.me/api/portraits/women/44.jpg",
        },
      });

      await tx.user.upsert({
        where: { email: "pending.verify@example.com" },
        update: {},
        create: {
          name: "Unverified Student",
          email: "pending.verify@example.com",
          emailVerified: false,
          role: Role.student,
        },
      });

      const instructor = await tx.user.upsert({
        where: { email: "instructor@academy.com" },
        update: {},
        create: {
          name: faker.person.fullName(),
          email: "instructor@academy.com",
          emailVerified: true,
          role: Role.instructor,
        },
      });

      const secondInstructor = await tx.user.upsert({
        where: { email: "instructor2@academy.com" },
        update: {},
        create: {
          name: faker.person.fullName(),
          email: "instructor2@academy.com",
          emailVerified: true,
          role: Role.instructor,
        },
      });

      const admin = await tx.user.upsert({
        where: { email: "admin@academy.com" },
        update: {},
        create: {
          name: "Admin User",
          email: "admin@academy.com",
          emailVerified: true,
          role: Role.admin,
        },
      });

      for (const user of [testUser, admin]) {
        await tx.account.upsert({
          where: {
            provider_providerId: {
              provider: "credentials",
              providerId: user.email,
            },
          },
          update: {},
          create: {
            userId: user.id,
            provider: "credentials",
            providerId: user.email,
            password: await bcrypt.hash("Password123", 12),
          },
        });
      }

      console.log("✅ Users seeded");

      // ====================== 2. PROGRAMS ======================
      const programsData = [
        {
          title: "Diploma Programs",
          slug: "diploma-programs",
          description: faker.lorem.paragraphs(2),
        },
        {
          title: "Professional Certifications",
          slug: "professional-certifications",
          description: faker.lorem.paragraphs(2),
        },
        {
          title: "Short Courses",
          slug: "short-courses",
          description: faker.lorem.paragraphs(2),
        },
      ] as const;

      const programs = [];
      for (const p of programsData) {
        const program = await tx.program.upsert({
          where: { slug: p.slug },
          update: {},
          create: {
            title: p.title,
            description: p.description,
            slug: p.slug,
            status: CourseStatus.PUBLISHED,
            image: `https://picsum.photos/id/${faker.number.int({ min: 100, max: 300 })}/800/600`,
          },
        });
        programs.push(program);
      }

      console.log("✅ Programs seeded");

      // ====================== 3. COURSES ======================
      const coursesData = [
        {
          title: "Accounting Basics Mastery",
          slug: "accounting-basics",
          code: "ACC-101",
          tags: ["accounting", "finance"],
          level: CourseLevel.BEGINNER,
          programIdx: 0 as number | null,
          instructor,
          isFree: false,
          issuesCertificate: true,
          lifetimeTier: false,
        },
        {
          title: "Financial Analysis Pro",
          slug: "financial-analysis",
          code: "ACC-201",
          tags: ["finance", "analysis"],
          level: CourseLevel.INTERMEDIATE,
          programIdx: 0,
          instructor,
          isFree: false,
          issuesCertificate: true,
          lifetimeTier: true,
        },
        {
          title: "Bookkeeping Essentials",
          slug: "bookkeeping-essentials",
          code: "ACC-102",
          tags: ["bookkeeping"],
          level: CourseLevel.BEGINNER,
          programIdx: 0,
          instructor,
          isFree: false,
          issuesCertificate: true,
          lifetimeTier: false,
        },
        {
          title: "Advanced Taxation Strategies",
          slug: "advanced-taxation",
          code: "TAX-301",
          tags: ["tax", "finance"],
          level: CourseLevel.ADVANCED,
          programIdx: 1,
          instructor: secondInstructor,
          isFree: false,
          issuesCertificate: false,
          lifetimeTier: false,
        },
        {
          title: "Business Valuation Masterclass",
          slug: "business-valuation",
          code: "FIN-401",
          tags: ["finance", "business"],
          level: CourseLevel.PROFESSIONAL,
          programIdx: 1,
          instructor: secondInstructor,
          isFree: false,
          issuesCertificate: false,
          lifetimeTier: false,
        },
        {
          title: "Payroll Management Certification",
          slug: "payroll-management",
          code: "HR-201",
          tags: ["payroll", "hr"],
          level: CourseLevel.INTERMEDIATE,
          programIdx: 1,
          instructor: secondInstructor,
          isFree: false,
          issuesCertificate: false,
          lifetimeTier: false,
        },
        {
          title: "Excel for Accountants",
          slug: "excel-for-accountants",
          code: "SKL-101",
          tags: ["excel", "productivity"],
          level: CourseLevel.BEGINNER,
          programIdx: 2,
          instructor,
          isFree: true,
          issuesCertificate: false,
          lifetimeTier: false,
        },
        {
          title: "Intro to Financial Literacy",
          slug: "financial-literacy-intro",
          code: "SKL-102",
          tags: ["finance", "basics"],
          level: CourseLevel.BEGINNER,
          programIdx: 2,
          instructor: secondInstructor,
          isFree: true,
          issuesCertificate: false,
          lifetimeTier: false,
        },
        {
          title: "Audit Fundamentals",
          slug: "audit-fundamentals",
          code: "AUD-101",
          tags: ["audit", "compliance"],
          level: CourseLevel.INTERMEDIATE,
          programIdx: 2,
          instructor,
          isFree: false,
          issuesCertificate: false,
          lifetimeTier: false,
        },
        {
          title: "Corporate Finance Strategy",
          slug: "corporate-finance-strategy",
          code: "FIN-501",
          tags: ["finance", "strategy"],
          level: CourseLevel.ADVANCED,
          programIdx: null,
          instructor: secondInstructor,
          isFree: false,
          issuesCertificate: false,
          lifetimeTier: false,
        },
      ];

      const createdCourses: CourseSeedMeta[] = [];

      for (let idx = 0; idx < coursesData.length; idx++) {
        const c = coursesData[idx];
        const course = await tx.course.create({
          data: {
            title: c.title,
            slug: c.slug,
            code: c.code,
            description: `${c.title} — ${faker.lorem.paragraph()}`,
            thumbnail: `https://picsum.photos/seed/${c.slug}/800/450`,
            videoPreview: "https://example.com/preview.mp4",
            level: c.level,
            tags: c.tags,
            status: CourseStatus.PUBLISHED,
            issuesCertificate: c.issuesCertificate,
            instructorId: c.instructor.id,
            pricings: {
              create: generatePricings(c.isFree, c.lifetimeTier),
            },
            modules: { create: generateModules(idx + 1) },
          },
        });

        await computeDurationAggregates(tx, course.id);

        createdCourses.push({
          course: {
            id: course.id,
            title: course.title,
            slug: course.slug,
            issuesCertificate: course.issuesCertificate,
          },
          isFree: c.isFree,
          programIdx: c.programIdx,
        });

        console.log(
          `✅ Seeded course: ${course.title}${c.isFree ? " (free)" : ""}`,
        );
      }

      console.log(
        "✅ Courses, Modules, Topics, VideoAssets & Resources seeded",
      );

      // ====================== 4. PROGRAM ↔ COURSE LINKING ======================
      const positionByProgram = new Map<number, number>();

      for (const { course, programIdx } of createdCourses) {
        if (programIdx === null) continue;

        const nextPosition = (positionByProgram.get(programIdx) ?? 0) + 1;
        positionByProgram.set(programIdx, nextPosition);

        await tx.programCourse.create({
          data: {
            programId: programs[programIdx].id,
            courseId: course.id,
            position: nextPosition,
          },
        });
      }

      console.log("✅ Program ↔ Course links seeded");

      // ====================== 5. PAID ORDER + ENROLLMENT + PAYMENT ======================
      const paidCourseEntry = createdCourses.find(
        (c) => c.course.slug === "accounting-basics",
      );

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
          const { expiresAt } = expiresAtFor(
            pricing.accessDurationDays,
            startedAt,
          );

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
            },
          });

          const enrollment = await tx.enrollment.create({
            data: {
              userId: testUser.id,
              courseId: paidCourseEntry.course.id,
              pricingId: pricing.id,
              orderItemId: orderItem.id,
              orderId: order.id,
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

          // Certificate path
          if (paidCourseEntry.course.issuesCertificate) {
            await tx.enrollment.update({
              where: { id: enrollment.id },
              data: {
                completedAt: new Date(),
                progressPercentage: 100,
              },
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

      // ====================== 6. FREE ORDER + ENROLLMENT ======================
      const freeCourseEntry = createdCourses.find(
        (c) => c.course.slug === "excel-for-accountants",
      );

      if (freeCourseEntry) {
        const freePricing = await tx.coursePricing.findFirst({
          where: {
            courseId: freeCourseEntry.course.id,
            isFree: true,
          },
        });

        if (freePricing) {
          const startedAt = new Date();
          const { expiresAt } = expiresAtFor(
            freePricing.accessDurationDays,
            startedAt,
          );

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
            },
          });

          await tx.enrollment.create({
            data: {
              userId: secondStudent.id,
              courseId: freeCourseEntry.course.id,
              pricingId: freePricing.id,
              orderItemId: freeOrderItem.id,
              orderId: freeOrder.id,
              status: EnrollmentStatus.ACTIVE,
              startedAt,
              expiresAt,
              progressPercentage: faker.number.int({ min: 5, max: 60 }),
            },
          });

          console.log(
            "✅ Free order + enrollment seeded (no Payment row, by design)",
          );
        }
      }

      // ====================== 7. REVOKED ENROLLMENT ======================
      const revokedCourseEntry = createdCourses.find(
        (c) => c.course.slug === "bookkeeping-essentials",
      );

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
          const { expiresAt } = expiresAtFor(
            pricing.accessDurationDays,
            startedAt,
          );
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
            },
          });

          await tx.enrollment.create({
            data: {
              userId: secondStudent.id,
              courseId: revokedCourseEntry.course.id,
              pricingId: pricing.id,
              orderItemId: orderItem.id,
              orderId: order.id,
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

          console.log("✅ Revoked (refunded) enrollment seeded");
        }
      }

      // ====================== 8. ADMIN AUDIT LOG ======================
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

      // ====================== 9. APPLICANTS ======================
      const applicantsData: Array<{
        fullName: string;
        status: ApplicantStatus;
        withSponsor?: boolean;
        withEmployment?: boolean;
      }> = [
        { fullName: faker.person.fullName(), status: ApplicantStatus.PENDING },
        {
          fullName: faker.person.fullName(),
          status: ApplicantStatus.REVIEWED,
          withEmployment: true,
        },
        {
          fullName: faker.person.fullName(),
          status: ApplicantStatus.APPROVED,
          withSponsor: true,
          withEmployment: true,
        },
        { fullName: faker.person.fullName(), status: ApplicantStatus.REJECTED },
      ];

      for (const a of applicantsData) {
        await tx.applicant.create({
          data: {
            fullName: a.fullName,
            email: faker.internet
              .email({ firstName: a.fullName.split(" ")[0] })
              .toLowerCase(),
            phone: faker.phone.number(),
            address: faker.location.streetAddress({ useFullAddress: true }),
            lectureCenter: faker.helpers.arrayElement([
              "Lagos",
              "Abuja",
              "Port Harcourt",
              null,
            ]),
            isNewStudent: faker.datatype.boolean(),
            level: faker.helpers.arrayElement(["Diploma", "Certificate", null]),
            careerChallenges: faker.lorem.sentence(),
            referredBy: faker.helpers.arrayElement([
              faker.person.fullName(),
              null,
            ]),
            status: a.status,
            ...(a.withEmployment && {
              employment: {
                create: {
                  placeOfWork: faker.company.name(),
                  position: faker.person.jobTitle(),
                },
              },
            }),
            ...(a.withSponsor && {
              sponsor: {
                create: {
                  name: faker.person.fullName(),
                  phone: faker.phone.number(),
                  email: faker.internet.email(),
                  location: faker.location.city(),
                  workplace: faker.company.name(),
                },
              },
            }),
          },
        });
      }

      console.log("✅ Applicants seeded");

      console.log("\n🎉 Seed completed successfully!");
      console.table({
        Users: 6,
        Programs: programs.length,
        Courses: coursesData.length,
        FreeCourses: coursesData.filter((c) => c.isFree).length,
        Applicants: applicantsData.length,
      });
    },
    { timeout: 180_000 },
  );
}

const nodeEnv = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env?.NODE_ENV;

if (nodeEnv === "production") {
  throw new Error("❌ Seeding is disabled in production");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error("❌ Seed failed:", e);  
    await prisma.$disconnect();
    (globalThis as typeof globalThis & {
      process: { exit: (code: number) => never };
    }).process.exit(1);
  });
