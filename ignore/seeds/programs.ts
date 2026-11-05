import { ProgramStatus, type Prisma } from "@prisma/client";
import { faker } from "@faker-js/faker";

export async function seedPrograms(tx: Prisma.TransactionClient) {
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
        status: ProgramStatus.PUBLISHED,
        image: `https://picsum.photos/id/${faker.number.int({ min: 100, max: 300 })}/800/600`,
      },
    });
    programs.push(program);
  }

  console.log("✅ Programs seeded");
  return programs;
}