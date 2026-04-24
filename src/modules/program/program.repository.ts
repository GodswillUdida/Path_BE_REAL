// program.repository.ts
import prisma from "../../lib/prisma";

export const programRepo = {
  findByTitle: (title: string) =>
    prisma.program.findFirst({
      where: { title, deletedAt: null },
    }),

  create: (data: any) =>
    prisma.program.create({ data }),

  findById: (id: string) =>
    prisma.program.findUnique({ where: { id } }),

  update: (id: string, data: any) =>
    prisma.program.update({ where: { id }, data }),

  list: () =>
    prisma.program.findMany({
      where: { deletedAt: null },
      include: { courses: true },
      orderBy: { createdAt: "desc" },
    }),
};