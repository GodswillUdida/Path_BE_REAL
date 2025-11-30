import prisma from "../../lib/prisma";
import { badRequest } from "../../utils/errors";

export const createProgram = async (data: {
  title: string;
  description?: string;
  image?: string;
}) => {
  const exists = await prisma.program.findUnique({
    where: { title: data.title },
  });
  if (exists) throw badRequest("Program title already exists");
  const program = await prisma.program.create({ data });
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
