import { generateUniqueSlug } from "../../utils/slugify";
import prisma from "../../lib/prisma";
import { badRequest, notFound } from "../../utils/errors";
import {
  // CreateModuleInput,
  // CreateModuleInput,
  ListModulesQuery,
  UpdateModuleInput,
} from "./module.schema";
import { withMetrics } from "../../utils/observability";

interface CreateModuleInput {
  title: string;
  description?: string;
  position?: number;
  courseId: string;
}

export const createModule = async (data: CreateModuleInput) => {
  return withMetrics("create_module", async () => {
    const course = await prisma.course.findUnique({
      where: { id: data.courseId },
      select: { id: true },
    });

    if (!course) throw notFound("Course not found");

    const slug = await generateUniqueSlug(
      data.title,
      "module",
    );

    const mod = await prisma.module.create({
      data: {
        title: data.title,
        description: data.description,
        position: data.position,
        slug,
        courseId: data.courseId,
      },
    });


    return mod;
  });
};

export const listModulesForCourse = async (
  courseId: string,
  query?: ListModulesQuery,
) => {
  const { limit = 20, offset = 0 } = query ?? {};

  // const cacheKey = `modules:${courseId}:${limit}:${offset}`;
  // const cached = await redis.get(cacheKey);
  // if (cached) return JSON.parse(cached);

  // try {
  //   const cached = await redis.get(cacheKey);
  //   if (cached) return JSON.parse(cached);
  // } catch (err) {
  //   console.warn("Redis read failed, continuing without cache");
  // }

  const [total, modules] = await prisma.$transaction([
    prisma.module.count({ where: { courseId, deletedAt: null } }),
    prisma.module.findMany({
      where: { courseId, deletedAt: null },
      skip: offset,
      take: limit,
      orderBy: { position: "asc" },
      include: { topics: true },
    }),
  ]);

  const result = {
    data: modules,
    meta: {
      total,
      limit,
      offset,
      pages: Math.ceil(total / limit),
    },
  };

  // try {
  //   await redis.set(cacheKey, JSON.stringify(result), "EX", 60);
  // } catch (err) {
  //   console.warn("Redis write failed, skipping cache");
  // }

  return result;
};

export const updateModule = async (id: string, data: UpdateModuleInput) => {
  const existing = await prisma.module.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw notFound("Module not found");

  let updatedSlug = existing.slug;
  if (data.title && data.title !== existing.title) {
    updatedSlug = await generateUniqueSlug(data.title, "module", id);
  }

  const updated = await prisma.module.update({
    where: { id },
    data: { ...data, slug: updatedSlug },
    include: { topics: true, course: true },
  });

  // Invalidate cache for course modules
  // await redis.del(`modules:${existing.courseId}:*`);

  return updated;
};

export const deleteModule = async (id: string) => {
  const existing = await prisma.module.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw notFound("Module not found");

  await prisma.module.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  // Invalidate cache for course modules
  // await redis.del(`modules:${existing.courseId}:*`);

  return true;
};

/* -------------------- ANALYTICS -------------------- */
export const incrementModuleView = async (id: string) => {
  const module = await prisma.module.update({
    where: { id },
    data: { views: { increment: 1 } },
  });
  return module.views;
};

export const incrementModuleCompletion = async (id: string) => {
  const module = await prisma.module.update({
    where: { id },
    data: { completions: { increment: 1 } },
  });
  return module.completions;
};
