import prisma from "../lib/prisma";
import slugify from "slugify";

export const generateUniqueSlug = async (
  base: string,
  model: "program" | "course" | "module" | "topic",
  existingId?: string,
): Promise<string> => {
  const baseSlug = slugify(base, { lower: true, strict: true });
  let slug = baseSlug;
  let counter = 1;

  const modelMap = {
    program: prisma.program,
    course: prisma.course,
    module: prisma.module,
    topic: prisma.topic,
  };

  while (true) {
    const exists = await (modelMap[model] as any).findFirst({
      where: {
        slug,
        NOT: existingId ? { NOT: { id: existingId } } : undefined,
      },
    });
    if (!exists) break;
    slug = `${baseSlug}-${counter++}`;
  }
  return slug;
};
