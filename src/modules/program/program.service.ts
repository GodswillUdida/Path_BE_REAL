import { AppError } from "../../middleware/error";
import prisma from "../../lib/prisma";
import { badRequest, notFound } from "../../utils/errors";
import { generateUniqueSlug } from "../../utils/slugify";

export const createProgram = async (data: {
  title: string;
  description?: string;
  image?: string;
}) => {
  const titleExists = await prisma.program.findFirst({
    where: { title: data.title },
  });

  if (titleExists) throw badRequest("Program title already exists");

  const slug = await generateUniqueSlug(data.title, "program");

  const program = await prisma.program.create({
    data: {
      title: data.title,
      description: data.description,
      slug,
      // image: data.image ?? null,
    },
  });
  return program;
};

export const listPrograms = async () => {
  return prisma.program.findMany({ include: { courses: true } });
};

export const getProgram = async (id: string) => {
  return prisma.program.findUnique({
    where: { id },
    include: { courses: true },
  });
};

export const getProgramBySlug = async (programSlug: string) => {
  try {
    const program = await prisma.program.findUnique({
      where: { slug: programSlug },
      include: { courses: true },
    });
    if (!program) throw new AppError("Program not found", 404);
    return program;
  } catch (error) {
    console.error(`Error fetching program with slug ${programSlug}:`, error);
    throw new AppError("Internal server error", 500);
  }
};

export const updateProgram = async (
  id: string,
  data: {
    title?: string;
    description?: string;
    image?: string;
    slug?: string;
  }
) => {
  let updatedSlug = data.slug;

  if (data.title) {
    const titleExists = await prisma.program.findFirst({
      where: { title: data.title, NOT: { id } },
    });

    if (titleExists) throw badRequest("Program title already exists");

    updatedSlug = await generateUniqueSlug(data.title, "program", id);
  }

  const program = await prisma.program.update({
    where: { id },
    data: {
      ...data,
      slug: updatedSlug,
    },
  });

  return program;
};

export const deleteProgram = async (id: string) => {
  return prisma.program.delete({ where: { id } });
};
