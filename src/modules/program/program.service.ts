import prisma from "../../lib/prisma";
import { badRequest, notFound } from "../../utils/errors";
import { generateUniqueSlug } from "../../utils/slugify";
import {
  createCourse,
} from "../../modules/course/course.service";
import { CreateProgramDTO, UpdateProgramDTO } from "./program.schema";
import { validateImage } from "../../utils/file";
import { withMetrics } from "../../utils/observability";

export const createProgram = async (data: CreateProgramDTO) => {
  return withMetrics("create_program", async () => {
    return prisma.$transaction(async (tx) => {
      const exists = await tx.program.findFirst({
        where: { title: data.title, deletedAt: null },
      });

      if (exists) throw badRequest("Program title already exists");

      const slug =
        data.slug ?? (await generateUniqueSlug(data.title, "program"));

      return tx.program.create({
        data: {
          title: data.title,
          description: data.description,
          slug,
          image: data.image ?? null,
        },
      });
    });
  });
};

export async function createCourseFromProgramId({
  programId,
  payload,
  adminId,
  file,
}: {
  programId: string;
  payload: any;
  adminId: string;
  file?: Express.Multer.File;
}) {
  return withMetrics("create_course", async () => {
    return prisma.$transaction(async (tx) => {
      const program = await tx.program.findUnique({
        where: { id: programId },
      });

      if (!program) throw notFound("Program not found");

      validateImage(file);

      return createCourse({
        data: { ...payload, programId },
        instructorId: adminId,
        file,
      });
    });
  });
}

export const listPrograms = async () => {
  return prisma.program.findMany({
    where: { deletedAt: null },
    include: { courses: true },
    orderBy: { createdAt: "desc" },
  });
};

export const getProgram = async (id: string) => {
  const program = await prisma.program.findUnique({
    where: { id },
    include: { courses: true },
  });
  if (!program || program.deletedAt) throw notFound("Program not found");
  return program;
};

export const getProgramBySlug = async (slug: string) => {
  const program = await prisma.program.findUnique({
    where: { slug },
    include: { courses: true },
  });
  if (!program || program.deletedAt) throw notFound("Program not found");
  return program;
};

export const updateProgram = async (id: string, data: UpdateProgramDTO) => {
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program || program.deletedAt) throw notFound("Program not found");

  let updatedSlug = data.slug ?? program.slug;
  if (data.title && data.title !== program.title) {
    const titleExists = await prisma.program.findFirst({
      where: { title: data.title, NOT: { id }, deletedAt: null },
    });
    if (titleExists) throw badRequest("Program title already exists");

    updatedSlug = await generateUniqueSlug(data.title, "program", id);
  }

  const updated = await prisma.program.update({
    where: { id },
    data: {
      ...data,
      slug: updatedSlug,
    },
  });

  return updated;
};

export const deleteProgram = async (id: string) => {
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program || program.deletedAt) throw notFound("Program not found");

  // Soft-delete
  return prisma.program.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
};