import prisma from "../src/lib/prisma";
import slugify from "slugify";

async function generateUniqueSlug(base: string, existingSlugs: Set<string>) {
  let slug = slugify(base, { lower: true, strict: true });
  let count = 2;
  while (existingSlugs.has(slug)) {
    slug = `${slug}-${count}`;
    count++;
  }
  existingSlugs.add(slug);
  return slug;
}

async function main() {
  // Backfill Program slugs
  const programs = await prisma.program.findMany();
  const programSlugs = new Set<string>();
  for (const p of programs) {
    if (!p.slug) {
      const slug = await generateUniqueSlug(p.title, programSlugs);
      await prisma.program.update({ where: { id: p.id }, data: { slug } });
    } else {
      programSlugs.add(p.slug);
    }
  }

  // Backfill Course slugs
  const courses = await prisma.course.findMany();
  const courseSlugs = new Set<string>();
  for (const c of courses) {
    if (!c.slug) {
      const slug = await generateUniqueSlug(c.title, courseSlugs);
      await prisma.course.update({ where: { id: c.id }, data: { slug } });
    } else {
      courseSlugs.add(c.slug);
    }
  }

  console.log("✅ Slugs backfilled for all existing Programs and Courses");
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
