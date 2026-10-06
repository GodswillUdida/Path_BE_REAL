"use strict";
/**
 * prisma/seed.ts
 *
 * Deterministic-enough seed for local / staging.
 * - VideoAssets are created as READY (no worker will process them).
 * - TopicResources are created as READY with realistic storageKey/url/mimeType.
 * - Duration aggregates are computed from real topic durations.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const faker_1 = require("@faker-js/faker");
const prisma = new client_1.PrismaClient();
let videoCounter = 1;
// ---------------------------------------------------------------------------
// Video asset generation
// ---------------------------------------------------------------------------
const PROVIDER_WEIGHTS = [
    client_1.VideoProvider.BUNNY,
    client_1.VideoProvider.BUNNY,
    client_1.VideoProvider.BUNNY,
    client_1.VideoProvider.BUNNY,
    client_1.VideoProvider.MUX,
    client_1.VideoProvider.AWS,
    client_1.VideoProvider.CLOUDFLARE,
];
function providerAssetIdFor(provider, seq) {
    switch (provider) {
        case client_1.VideoProvider.BUNNY:
            return `bvid_${seq}`;
        case client_1.VideoProvider.MUX:
            return `mux_${faker_1.faker.string.alphanumeric(20)}`;
        case client_1.VideoProvider.AWS:
            return `s3://lms-video-assets/originals/${seq}.mp4`;
        case client_1.VideoProvider.CLOUDFLARE:
            return faker_1.faker.string.uuid();
        default: {
            const _exhaustive = provider;
            return _exhaustive;
        }
    }
}
function generateVideoAsset(durationSeconds) {
    const provider = faker_1.faker.helpers.arrayElement(PROVIDER_WEIGHTS);
    const seq = String(videoCounter++).padStart(4, "0");
    const providerAssetId = providerAssetIdFor(provider, seq);
    const width = faker_1.faker.helpers.arrayElement([1920, 1280]);
    const height = width === 1920 ? 1080 : 720;
    return {
        provider,
        providerAssetId,
        status: client_1.VideoStatus.READY,
        durationSeconds,
        thumbnailUrl: `https://picsum.photos/seed/${faker_1.faker.string.uuid().slice(0, 10)}/400/225`,
        fileSizeBytes: BigInt(faker_1.faker.number.int({ min: 20000000, max: 800000000 })),
        width,
        height,
        retryCount: 0,
        idempotencyKey: faker_1.faker.string.uuid(),
        readyAt: faker_1.faker.date.recent({ days: 30 }),
    };
}
const FILE_RESOURCE_META = {
    [client_1.ResourceType.PDF]: {
        extension: "pdf",
        mimeType: "application/pdf",
    },
    [client_1.ResourceType.EXCEL]: {
        extension: "xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    [client_1.ResourceType.WORD]: {
        extension: "docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    [client_1.ResourceType.TEMPLATE]: {
        extension: "pdf",
        mimeType: "application/pdf",
    },
};
function generateTopicResources() {
    // ~60% of topics have no supplementary resources
    if (faker_1.faker.number.int({ min: 1, max: 10 }) > 4)
        return [];
    const count = faker_1.faker.number.int({ min: 1, max: 3 });
    const resources = [];
    for (let i = 0; i < count; i++) {
        // Mix LINK + file types
        const isLink = faker_1.faker.datatype.boolean({ probability: 0.25 });
        if (isLink) {
            resources.push({
                type: client_1.ResourceType.LINK,
                title: faker_1.faker.lorem.words({ min: 2, max: 5 }),
                storageKey: null,
                url: faker_1.faker.internet.url(),
                mimeType: null,
                sizeBytes: null,
                status: client_1.ResourceStatus.READY,
                position: i,
                readyAt: faker_1.faker.date.recent({ days: 30 }),
            });
            continue;
        }
        const type = faker_1.faker.helpers.arrayElement([
            client_1.ResourceType.PDF,
            client_1.ResourceType.EXCEL,
            client_1.ResourceType.WORD,
            client_1.ResourceType.TEMPLATE,
        ]);
        const meta = FILE_RESOURCE_META[type];
        const resourceId = faker_1.faker.string.uuid();
        const slug = faker_1.faker.helpers.slugify(faker_1.faker.lorem.words({ min: 2, max: 4 }));
        const fileName = `${slug}.${meta.extension}`;
        const storageKey = `topics/seed/resources/${resourceId}/${fileName}`;
        resources.push({
            type,
            title: `${faker_1.faker.lorem.words({ min: 2, max: 4 })} (${type})`,
            storageKey,
            url: `https://pathfinder-pull.b-cdn.net/${storageKey}`,
            mimeType: meta.mimeType,
            sizeBytes: faker_1.faker.number.int({ min: 50000, max: 5000000 }),
            status: client_1.ResourceStatus.READY,
            position: i,
            readyAt: faker_1.faker.date.recent({ days: 30 }),
        });
    }
    return resources;
}
// ---------------------------------------------------------------------------
// Topics / Modules
// ---------------------------------------------------------------------------
function generateTopics(moduleSeq) {
    const count = faker_1.faker.number.int({ min: 3, max: 7 });
    return Array.from({ length: count }, (_, i) => {
        const durationSeconds = faker_1.faker.number.int({ min: 240, max: 1500 });
        return {
            title: faker_1.faker.lorem.words({ min: 3, max: 8 }),
            slug: `topic-${moduleSeq}-${i + 1}`,
            position: i + 1,
            durationSeconds,
            videoAsset: { create: generateVideoAsset(durationSeconds) },
            resources: { create: generateTopicResources() },
        };
    });
}
function generateModules(courseSeq) {
    const count = faker_1.faker.number.int({ min: 4, max: 8 });
    return Array.from({ length: count }, (_, i) => ({
        title: faker_1.faker.lorem.words({ min: 2, max: 6 }),
        slug: `module-${i + 1}`,
        description: faker_1.faker.lorem.paragraph(),
        position: i + 1,
        topics: { create: generateTopics(courseSeq * 100 + i + 1) },
    }));
}
// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------
function generatePricings(isFree, includeLifetimeTier = false) {
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
    const tiers = [
        {
            name: "7 Days",
            price: faker_1.faker.number.int({ min: 4500, max: 12000 }),
            accessDurationDays: 7,
            sortOrder: 1,
        },
        {
            name: "30 Days",
            price: faker_1.faker.number.int({ min: 14000, max: 28000 }),
            accessDurationDays: 30,
            sortOrder: 2,
        },
        {
            name: "90 Days",
            price: faker_1.faker.number.int({ min: 38000, max: 65000 }),
            accessDurationDays: 90,
            sortOrder: 3,
        },
    ];
    if (includeLifetimeTier) {
        tiers.push({
            name: "Lifetime",
            price: faker_1.faker.number.int({ min: 85000, max: 150000 }),
            accessDurationDays: null,
            sortOrder: 4,
        });
    }
    return tiers;
}
function expiresAtFor(accessDurationDays, from) {
    if (accessDurationDays === null)
        return { expiresAt: null };
    return {
        expiresAt: new Date(from.getTime() + accessDurationDays * 24 * 60 * 60 * 1000),
    };
}
// ---------------------------------------------------------------------------
// Duration aggregates
// ---------------------------------------------------------------------------
async function computeDurationAggregates(tx, courseId) {
    const modules = await tx.module.findMany({
        where: { courseId },
        select: {
            id: true,
            topics: { select: { durationSeconds: true } },
        },
    });
    let courseTotal = 0;
    for (const mod of modules) {
        const moduleTotal = mod.topics.reduce((sum, t) => sum + t.durationSeconds, 0);
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
async function main() {
    console.log("🌱 Starting database seed...");
    await prisma.$transaction(async (tx) => {
        // ====================== 1. USERS ======================
        const testUser = await tx.user.upsert({
            where: { email: "test@example.com" },
            update: {},
            create: {
                name: "Test Student",
                email: "test@example.com",
                emailVerified: true,
                role: client_1.Role.student,
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
                role: client_1.Role.student,
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
                role: client_1.Role.student,
            },
        });
        const instructor = await tx.user.upsert({
            where: { email: "instructor@academy.com" },
            update: {},
            create: {
                name: faker_1.faker.person.fullName(),
                email: "instructor@academy.com",
                emailVerified: true,
                role: client_1.Role.instructor,
            },
        });
        const secondInstructor = await tx.user.upsert({
            where: { email: "instructor2@academy.com" },
            update: {},
            create: {
                name: faker_1.faker.person.fullName(),
                email: "instructor2@academy.com",
                emailVerified: true,
                role: client_1.Role.instructor,
            },
        });
        const admin = await tx.user.upsert({
            where: { email: "admin@academy.com" },
            update: {},
            create: {
                name: "Admin User",
                email: "admin@academy.com",
                emailVerified: true,
                role: client_1.Role.admin,
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
                    password: await bcryptjs_1.default.hash("Password123", 12),
                },
            });
        }
        console.log("✅ Users seeded");
        // ====================== 2. PROGRAMS ======================
        const programsData = [
            {
                title: "Diploma Programs",
                slug: "diploma-programs",
                description: faker_1.faker.lorem.paragraphs(2),
            },
            {
                title: "Professional Certifications",
                slug: "professional-certifications",
                description: faker_1.faker.lorem.paragraphs(2),
            },
            {
                title: "Short Courses",
                slug: "short-courses",
                description: faker_1.faker.lorem.paragraphs(2),
            },
        ];
        const programs = [];
        for (const p of programsData) {
            const program = await tx.program.upsert({
                where: { slug: p.slug },
                update: {},
                create: {
                    title: p.title,
                    description: p.description,
                    slug: p.slug,
                    status: client_1.CourseStatus.PUBLISHED,
                    image: `https://picsum.photos/id/${faker_1.faker.number.int({ min: 100, max: 300 })}/800/600`,
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
                level: client_1.CourseLevel.BEGINNER,
                programIdx: 0,
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
                level: client_1.CourseLevel.INTERMEDIATE,
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
                level: client_1.CourseLevel.BEGINNER,
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
                level: client_1.CourseLevel.ADVANCED,
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
                level: client_1.CourseLevel.PROFESSIONAL,
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
                level: client_1.CourseLevel.INTERMEDIATE,
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
                level: client_1.CourseLevel.BEGINNER,
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
                level: client_1.CourseLevel.BEGINNER,
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
                level: client_1.CourseLevel.INTERMEDIATE,
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
                level: client_1.CourseLevel.ADVANCED,
                programIdx: null,
                instructor: secondInstructor,
                isFree: false,
                issuesCertificate: false,
                lifetimeTier: false,
            },
        ];
        const createdCourses = [];
        for (let idx = 0; idx < coursesData.length; idx++) {
            const c = coursesData[idx];
            const course = await tx.course.create({
                data: {
                    title: c.title,
                    slug: c.slug,
                    code: c.code,
                    description: `${c.title} — ${faker_1.faker.lorem.paragraph()}`,
                    thumbnail: `https://picsum.photos/seed/${c.slug}/800/450`,
                    videoPreview: "https://example.com/preview.mp4",
                    level: c.level,
                    tags: c.tags,
                    status: client_1.CourseStatus.PUBLISHED,
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
            console.log(`✅ Seeded course: ${course.title}${c.isFree ? " (free)" : ""}`);
        }
        console.log("✅ Courses, Modules, Topics, VideoAssets & Resources seeded");
        // ====================== 4. PROGRAM ↔ COURSE LINKING ======================
        const positionByProgram = new Map();
        for (const { course, programIdx } of createdCourses) {
            if (programIdx === null)
                continue;
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
                const reference = `PSK_${faker_1.faker.string.alphanumeric(14).toUpperCase()}`;
                const startedAt = new Date();
                const { expiresAt } = expiresAtFor(pricing.accessDurationDays, startedAt);
                const order = await tx.order.create({
                    data: {
                        userId: testUser.id,
                        email: testUser.email,
                        name: testUser.name,
                        totalAmount: pricing.price,
                        isFreeOrder: false,
                        currency: "NGN",
                        status: client_1.PaymentStatus.PAID,
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
                        status: client_1.EnrollmentStatus.ACTIVE,
                        startedAt,
                        expiresAt,
                        progressPercentage: faker_1.faker.number.int({ min: 15, max: 92 }),
                    },
                });
                await tx.payment.create({
                    data: {
                        userId: testUser.id,
                        reference,
                        gatewayEventId: `evt_${faker_1.faker.string.alphanumeric(20)}`,
                        orderId: order.id,
                        amount: pricing.price,
                        currency: "NGN",
                        status: client_1.PaymentStatus.PAID,
                        gateway: client_1.PaymentGateway.PAYSTACK,
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
                            url: `https://cdn.academy.com/certificates/${faker_1.faker.string.uuid()}.pdf`,
                            verification: faker_1.faker.string.alphanumeric(12).toUpperCase(),
                            courseTitleAtIssuance: paidCourseEntry.course.title,
                        },
                    });
                    console.log("✅ Certificate seeded");
                }
                console.log("✅ Paid order + enrollment + payment seeded");
            }
        }
        // ====================== 6. FREE ORDER + ENROLLMENT ======================
        const freeCourseEntry = createdCourses.find((c) => c.course.slug === "excel-for-accountants");
        if (freeCourseEntry) {
            const freePricing = await tx.coursePricing.findFirst({
                where: {
                    courseId: freeCourseEntry.course.id,
                    isFree: true,
                },
            });
            if (freePricing) {
                const startedAt = new Date();
                const { expiresAt } = expiresAtFor(freePricing.accessDurationDays, startedAt);
                const freeOrder = await tx.order.create({
                    data: {
                        userId: secondStudent.id,
                        email: secondStudent.email,
                        name: secondStudent.name,
                        totalAmount: 0,
                        isFreeOrder: true,
                        currency: "NGN",
                        status: client_1.PaymentStatus.PAID,
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
                        status: client_1.EnrollmentStatus.ACTIVE,
                        startedAt,
                        expiresAt,
                        progressPercentage: faker_1.faker.number.int({ min: 5, max: 60 }),
                    },
                });
                console.log("✅ Free order + enrollment seeded (no Payment row, by design)");
            }
        }
        // ====================== 7. REVOKED ENROLLMENT ======================
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
                const startedAt = faker_1.faker.date.recent({ days: 20 });
                const { expiresAt } = expiresAtFor(pricing.accessDurationDays, startedAt);
                const reference = `PSK_${faker_1.faker.string.alphanumeric(14).toUpperCase()}`;
                const order = await tx.order.create({
                    data: {
                        userId: secondStudent.id,
                        email: secondStudent.email,
                        name: secondStudent.name,
                        totalAmount: pricing.price,
                        isFreeOrder: false,
                        currency: "NGN",
                        status: client_1.PaymentStatus.REFUNDED,
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
                        status: client_1.EnrollmentStatus.REVOKED,
                        startedAt,
                        expiresAt,
                        progressPercentage: faker_1.faker.number.int({ min: 0, max: 20 }),
                    },
                });
                await tx.payment.create({
                    data: {
                        userId: secondStudent.id,
                        reference,
                        gatewayEventId: `evt_${faker_1.faker.string.alphanumeric(20)}`,
                        orderId: order.id,
                        amount: pricing.price,
                        currency: "NGN",
                        status: client_1.PaymentStatus.REFUNDED,
                        gateway: client_1.PaymentGateway.PAYSTACK,
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
                        previousStatus: client_1.CourseStatus.DRAFT,
                        newStatus: client_1.CourseStatus.PUBLISHED,
                    },
                },
            });
            console.log("✅ Admin audit log seeded");
        }
        // ====================== 9. APPLICANTS ======================
        const applicantsData = [
            { fullName: faker_1.faker.person.fullName(), status: client_1.ApplicantStatus.PENDING },
            {
                fullName: faker_1.faker.person.fullName(),
                status: client_1.ApplicantStatus.REVIEWED,
                withEmployment: true,
            },
            {
                fullName: faker_1.faker.person.fullName(),
                status: client_1.ApplicantStatus.APPROVED,
                withSponsor: true,
                withEmployment: true,
            },
            { fullName: faker_1.faker.person.fullName(), status: client_1.ApplicantStatus.REJECTED },
        ];
        for (const a of applicantsData) {
            await tx.applicant.create({
                data: {
                    fullName: a.fullName,
                    email: faker_1.faker.internet
                        .email({ firstName: a.fullName.split(" ")[0] })
                        .toLowerCase(),
                    phone: faker_1.faker.phone.number(),
                    address: faker_1.faker.location.streetAddress({ useFullAddress: true }),
                    lectureCenter: faker_1.faker.helpers.arrayElement([
                        "Lagos",
                        "Abuja",
                        "Port Harcourt",
                        null,
                    ]),
                    isNewStudent: faker_1.faker.datatype.boolean(),
                    level: faker_1.faker.helpers.arrayElement(["Diploma", "Certificate", null]),
                    careerChallenges: faker_1.faker.lorem.sentence(),
                    referredBy: faker_1.faker.helpers.arrayElement([
                        faker_1.faker.person.fullName(),
                        null,
                    ]),
                    status: a.status,
                    ...(a.withEmployment && {
                        employment: {
                            create: {
                                placeOfWork: faker_1.faker.company.name(),
                                position: faker_1.faker.person.jobTitle(),
                            },
                        },
                    }),
                    ...(a.withSponsor && {
                        sponsor: {
                            create: {
                                name: faker_1.faker.person.fullName(),
                                phone: faker_1.faker.phone.number(),
                                email: faker_1.faker.internet.email(),
                                location: faker_1.faker.location.city(),
                                workplace: faker_1.faker.company.name(),
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
    }, { timeout: 180000 });
}
if (process.env.NODE_ENV === "production") {
    throw new Error("❌ Seeding is disabled in production");
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
});
