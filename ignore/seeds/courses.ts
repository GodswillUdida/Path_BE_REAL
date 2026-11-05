import { CourseLevel, CourseStatus, type Prisma } from "@prisma/client";
import { faker } from "@faker-js/faker";
import { computeDurationAggregates, generateModules, generatePricings } from "./helpers";
import type { SeedUsers } from "./users";

export type CourseSeedMeta = {
  course: {
    id: string;
    title: string;
    slug: string;
    issuesCertificate: boolean;
  };
  isFree: boolean;
  programIdx: number | null;
};

export async function seedCourses(
  tx: Prisma.TransactionClient,
  users: SeedUsers,
  programs: { id: string }[],
): Promise<CourseSeedMeta[]> {
  const { instructor, secondInstructor } = users;

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

  const created: CourseSeedMeta[] = [];

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
        pricings: { create: generatePricings(c.isFree, c.lifetimeTier) },
        modules: { create: generateModules(idx + 1) },
      },
    });

    await computeDurationAggregates(tx, course.id);

    created.push({
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

  const positionByProgram = new Map<number, number>();
  for (const { course, programIdx } of created) {
    if (programIdx === null) continue;
    const next = (positionByProgram.get(programIdx) ?? 0) + 1;
    positionByProgram.set(programIdx, next);
    await tx.programCourse.create({
      data: {
        programId: programs[programIdx].id,
        courseId: course.id,
        position: next,
      },
    });
  }

  console.log("✅ Courses + Program links seeded");
  return created;
}