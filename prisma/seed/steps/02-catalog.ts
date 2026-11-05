import { faker } from "@faker-js/faker";
import type { CourseLevel, Prisma } from "@prisma/client";
import type { SeedCtx } from "../context";
import { BONUS_DAYS, SEED_VALUE } from "../config";
import { COURSE_CONTENT } from "../data/content";
import { sid } from "../lib/helpers";
import { topicResources, videoAsset } from "../lib/media";

interface CourseSpec {
  slug: string;
  title: string;
  code: string;
  level: CourseLevel;
  tags: string[];
  program: "diploma" | "professional" | "short" | null;
  instructor: "instructor" | "instructor2";
  free: boolean;
  certificate: boolean;
  lifetimeTier: boolean;
  /** Paid tiers beyond free. 30-day plan always gets BONUS_DAYS. */
  paidTiers?: { name: string; days: number | null; price: number; sort: number }[];
}

const PROGRAMS = [
  {
    key: "diploma",
    title: "Diploma Programs",
    slug: "diploma-programs",
  },
  {
    key: "professional",
    title: "Professional Certifications",
    slug: "professional-certifications",
  },
  {
    key: "short",
    title: "Short Courses",
    slug: "short-courses",
  },
] as const;

const COURSES: CourseSpec[] = [
  {
    slug: "accounting-basics",
    title: "Accounting Basics Mastery",
    code: "ACC-101",
    level: "BEGINNER",
    tags: ["accounting", "finance"],
    program: "diploma",
    instructor: "instructor",
    free: false,
    certificate: true,
    lifetimeTier: false,
    paidTiers: [
      { name: "7 Days", days: 7, price: 7_500, sort: 1 },
      { name: "30 Days", days: 30, price: 18_000, sort: 2 },
      { name: "90 Days", days: 90, price: 45_000, sort: 3 },
    ],
  },
  {
    slug: "financial-analysis",
    title: "Financial Analysis Pro",
    code: "ACC-201",
    level: "INTERMEDIATE",
    tags: ["finance", "analysis"],
    program: "diploma",
    instructor: "instructor",
    free: false,
    certificate: true,
    lifetimeTier: true,
    paidTiers: [
      { name: "30 Days", days: 30, price: 22_000, sort: 1 },
      { name: "90 Days", days: 90, price: 55_000, sort: 2 },
      { name: "Lifetime", days: null, price: 120_000, sort: 3 },
    ],
  },
  {
    slug: "bookkeeping-essentials",
    title: "Bookkeeping Essentials",
    code: "ACC-102",
    level: "BEGINNER",
    tags: ["bookkeeping"],
    program: "diploma",
    instructor: "instructor",
    free: false,
    certificate: true,
    lifetimeTier: false,
    paidTiers: [
      { name: "7 Days", days: 7, price: 6_000, sort: 1 },
      { name: "30 Days", days: 30, price: 16_000, sort: 2 },
    ],
  },
  {
    slug: "advanced-taxation",
    title: "Advanced Taxation Strategies",
    code: "TAX-301",
    level: "ADVANCED",
    tags: ["tax", "finance"],
    program: "professional",
    instructor: "instructor2",
    free: false,
    certificate: false,
    lifetimeTier: false,
    paidTiers: [{ name: "30 Days", days: 30, price: 28_000, sort: 1 }],
  },
  {
    slug: "payroll-management",
    title: "Payroll Management Certification",
    code: "HR-201",
    level: "INTERMEDIATE",
    tags: ["payroll", "hr"],
    program: "professional",
    instructor: "instructor2",
    free: false,
    certificate: false,
    lifetimeTier: false,
    paidTiers: [{ name: "30 Days", days: 30, price: 20_000, sort: 1 }],
  },
  {
    slug: "excel-for-accountants",
    title: "Excel for Accountants",
    code: "SKL-101",
    level: "BEGINNER",
    tags: ["excel", "productivity"],
    program: "short",
    instructor: "instructor",
    free: true,
    certificate: false,
    lifetimeTier: false,
  },
  {
    slug: "audit-fundamentals",
    title: "Audit Fundamentals",
    code: "AUD-101",
    level: "INTERMEDIATE",
    tags: ["audit", "compliance"],
    program: "short",
    instructor: "instructor",
    free: false,
    certificate: false,
    lifetimeTier: false,
    paidTiers: [
      { name: "30 Days", days: 30, price: 19_000, sort: 1 },
      { name: "90 Days", days: 90, price: 48_000, sort: 2 },
    ],
  },
  {
    slug: "corporate-finance-strategy",
    title: "Corporate Finance Strategy",
    code: "FIN-501",
    level: "ADVANCED",
    tags: ["finance", "strategy"],
    program: null,
    instructor: "instructor2",
    free: false,
    certificate: false,
    lifetimeTier: false,
    paidTiers: [{ name: "30 Days", days: 30, price: 35_000, sort: 1 }],
  },
];

export async function seedCatalog(ctx: SeedCtx): Promise<void> {
  const { db } = ctx;
  faker.seed(SEED_VALUE + 2);

  // ── programs ───────────────────────────────────────────────────────────
  for (const p of PROGRAMS) {
    const row = await db.program.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        id: sid(`program:${p.key}`),
        title: p.title,
        slug: p.slug,
        description: `${p.title} — practical pathways for accounting and finance professionals.`,
        status: "PUBLISHED",
        image: `https://picsum.photos/seed/${p.slug}/800/600`,
      },
      select: { id: true, slug: true },
    });
    ctx.programs[p.key] = { id: row.id, slug: row.slug };
  }

  // ── courses + pricing + curriculum ─────────────────────────────────────
  for (const [idx, c] of COURSES.entries()) {
    const courseId = sid(`course:${c.slug}`);
    const content = COURSE_CONTENT[c.slug] ?? {
      modules: Array.from({ length: 4 }, (_, mi) => ({
        title: `Module ${mi + 1}`,
        topics: Array.from({ length: 4 }, (_, ti) => ({
          title: `Topic ${ti + 1}`,
          durationSeconds: 480 + ti * 120,
        })),
      })),
    };

    await db.course.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        id: courseId,
        title: c.title,
        slug: c.slug,
        code: c.code,
        description: `${c.title}. ${faker.lorem.paragraph()}`,
        thumbnail: `https://picsum.photos/seed/${c.slug}/800/450`,
        videoPreview: null,
        level: c.level,
        tags: c.tags,
        status: "PUBLISHED",
        issuesCertificate: c.certificate,
        instructorId: ctx.users[c.instructor].id,
      },
    });

    // pricing
    const pricingRows: Prisma.CoursePricingCreateManyInput[] = [];
    if (c.free) {
      pricingRows.push({
        id: sid(`pricing:${c.slug}:free`),
        courseId,
        name: "Free Access",
        price: 0,
        isFree: true,
        currency: "NGN",
        accessDurationDays: null,
        bonusDays: 0,
        sortOrder: 1,
        isActive: true,
      });
    }
    for (const t of c.paidTiers ?? []) {
      pricingRows.push({
        id: sid(`pricing:${c.slug}:${t.days ?? "life"}`),
        courseId,
        name: t.name,
        price: t.price,
        isFree: false,
        currency: "NGN",
        accessDurationDays: t.days,
        bonusDays: t.days === 30 ? BONUS_DAYS : 0,
        sortOrder: t.sort,
        isActive: true,
      });
    }
    await db.coursePricing.createMany({ data: pricingRows, skipDuplicates: true });

    // modules / topics / media
    let courseDuration = 0;
    for (const [mi, mod] of content.modules.entries()) {
      const moduleId = sid(`module:${c.slug}:${mi}`);
      let moduleDuration = 0;
      const topicCreates: Prisma.TopicCreateWithoutModuleInput[] = [];

      for (const [ti, topic] of mod.topics.entries()) {
        const topicKey = `${c.slug}-m${mi}-t${ti}`;
        moduleDuration += topic.durationSeconds;
        topicCreates.push({
          id: sid(`topic:${topicKey}`),
          title: topic.title,
          slug: `topic-${mi + 1}-${ti + 1}`,
          position: ti + 1,
          durationSeconds: topic.durationSeconds,
          videoAsset: { create: videoAsset(topicKey, topic.durationSeconds) },
          resources: { create: topicResources(topicKey) },
        });
      }
      courseDuration += moduleDuration;

      await db.module.upsert({
        where: { courseId_slug: { courseId, slug: `module-${mi + 1}` } },
        update: {},
        create: {
          id: moduleId,
          courseId,
          title: mod.title,
          slug: `module-${mi + 1}`,
          description: mod.title,
          position: mi + 1,
          totalDurationSeconds: moduleDuration,
          topics: { create: topicCreates },
        },
      });
    }

    await db.course.update({
      where: { id: courseId },
      data: { totalDurationSeconds: courseDuration },
    });

    // program link
    if (c.program) {
      await db.programCourse.upsert({
        where: {
          programId_courseId: {
            programId: ctx.programs[c.program].id,
            courseId,
          },
        },
        update: {},
        create: {
          id: sid(`pc:${c.program}:${c.slug}`),
          programId: ctx.programs[c.program].id,
          courseId,
          position: idx + 1,
        },
      });
    }

    // expose for later steps
    const pricings = await db.coursePricing.findMany({
      where: { courseId },
      select: {
        id: true,
        accessDurationDays: true,
        bonusDays: true,
        price: true,
        isFree: true,
        name: true,
      },
    });

    ctx.courses[c.slug] = {
      id: courseId,
      slug: c.slug,
      title: c.title,
      issuesCertificate: c.certificate,
      pricings: Object.fromEntries(
        pricings.map((p) => {
          const key = p.isFree
            ? "free"
            : p.accessDurationDays === null
              ? "lifetime"
              : String(p.accessDurationDays);
          return [
            key,
            {
              id: p.id,
              accessDurationDays: p.accessDurationDays,
              bonusDays: p.bonusDays,
              price: p.price,
              isFree: p.isFree,
              name: p.name,
            },
          ];
        }),
      ),
    };
  }

  console.log(`  catalog: ${PROGRAMS.length} programs, ${COURSES.length} courses`);
}