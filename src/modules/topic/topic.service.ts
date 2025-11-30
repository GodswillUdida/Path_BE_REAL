import prisma from "../../lib/prisma";
import { notFound } from "../../utils/errors";

export const createTopic = async (data: {
  moduleId: string;
  title: string;
  videoUrl?: string | null;
  resources?: string[];
}) => {
  const module = await prisma.module.findUnique({
    where: { id: data.moduleId },
  });
  if (!module) throw notFound("Module not found");

  const topic = await prisma.topic.create({
    data: {
      moduleId: data.moduleId,
      title: data.title,
      videoUrl: data.videoUrl ?? null,
      resources: data.resources ?? [],
    },
  });

  return topic;
};

export const listTopicsForModule = async (moduleId: string) => {
  return prisma.topic.findMany({
    where: { moduleId },
    orderBy: { createdAt: "asc" },
  });
};

export const updateTopic = async (
  id: string,
  data: Partial<{
    title: string;
    videoUrl?: string | null;
    resources?: string[];
  }>
) => {
  const updated = await prisma.topic.update({ where: { id }, data });
  return updated;
};

export const deleteTopic = async (id: string) => {
  await prisma.topic.delete({ where: { id } });
  return true;
};
