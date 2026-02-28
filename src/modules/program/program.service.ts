import { AppError } from "../../middleware/error";
import prisma from "../../lib/prisma";
import { badRequest, notFound } from "../../utils/errors";
import { generateUniqueSlug } from "../../utils/slugify";
import {
  createOnlineCourse,
} from "../../modules/course/course.service";
import { CreateProgramDTO, UpdateProgramDTO } from "./program.schema";

export const createProgram = async (data: CreateProgramDTO) => {
  const titleExists = await prisma.program.findFirst({
    where: { title: data.title, deletedAt: null },
  });

  if (titleExists) throw badRequest("Program title already exists");

  const slug = data.slug ?? (await generateUniqueSlug(data.title, "program"));
  // const slug = await generateUniqueSlug(data.title, "program");

  const program = await prisma.program.create({
    data: {
      title: data.title,
      description: data.description,
      slug,
      image: data.image ?? null,
    },
  });
  return program;
};

export async function createCourseFromProgramId(params: {
  programId: string;
  type: "physical" | "online";
  payload: any;
  adminId: string;
  fileBuffer?: Buffer;
  fileMime?: string;
}) {
  const program = await prisma.program.findUnique({
    where: { id: params.programId },
    select: { slug: true },
  });

  if (!program) throw notFound("Program not found");

  switch (params.type) {
    case "online":
      return createOnlineCourse(
        // program.slug,
        params.payload,
        params.adminId,
        params.fileBuffer,
        params.fileMime,
      );
    default:
      throw badRequest("Invalid course type");
  }

  // if (params.type === "physical") {
  //   return createPhysicalCourse(
  //     program.slug,
  //     params.payload,
  //     params.adminId,
  //     params.fileBuffer,
  //     params.fileMime
  //   );
  // }

  // if (params.type === "online") {
  //   return createOnlineCourse(
  //     program.slug,
  //     params.payload,
  //     params.adminId,
  //     params.fileBuffer,
  //     params.fileMime
  //   );
  // }

  // throw new Error("Invalid course type");
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