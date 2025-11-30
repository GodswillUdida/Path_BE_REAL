import prisma from "../../lib/prisma";
import { badRequest, notFound } from "../../utils/errors";

export const createModule = async (data: {
  courseId: string;
  title: string;
  description?: string;
}) => {
  const course = await prisma.course.findUnique({
    where: { id: data.courseId },
  });
  if (!course) throw notFound("Course not found");

  const created = await prisma.module.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      courseId: data.courseId,
    },
    include: { topics: true },
  });
  return created;
};

export const listModulesForCourse = async (courseId: string) => {
  return prisma.module.findMany({
    where: { courseId },
    include: { topics: true },
  });
};

export const updateModule = async (
  id: string,
  data: Partial<{ title: string; description?: string }>
) => {
  const updated = await prisma.module.update({
    where: { id },
    data,
    include: { topics: true },
  });
  return updated;
};

export const deleteModule = async (id: string) => {
  await prisma.module.delete({ where: { id } });
  return true;
};
