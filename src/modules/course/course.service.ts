import prisma from "../../lib/prisma";
import slugify from "slugify";
import type { CreateCourseInput } from "./course.schema";
import { badRequest, notFound } from "../..//utils/errors";
// import logger from "../../utils/logger";
// import { streamUpload } from "config/stream";
// import { AppError } from "../../middleware/error";

// async function findOrCreateProgram(
//   programId?: string | null,
//   programTitle?: string | null
// ) {
//   if (programId) {
//     const existing = await prisma.program.findUnique({
//       where: { id: programId },
//     });
//     if (existing) return existing;
//   }

//   if (programTitle) {
//     const title = programTitle.trim();
//     const existing = await prisma.program.findFirst({
//       where: { title },
//     });
//     if (existing) return existing;

//     return prisma.program.create({
//       data: {
//         title,
//         description: `${title} Program`,
//         image: "/default-program-image.jpg",
//       },
//     });
//   }

//   return null;
// }

export async function createCourse(data: CreateCourseInput, adminId: string) {
  const { program, pricings, ...courseData } = data;

  const slug = slugify(courseData.title, { lower: true, strict: true });

  // const programdd= await findOrCreateProgram(
  //   data.programId ?? null,
  //   data.programTitle ?? null
  // );

  // handle program inline creation
  let programId: string;

  if (data.program.id) {
    const existing = await prisma.program.findUnique({
      where: { id: data.program.id },
    });
    if (!existing) throw badRequest("Program does not exist");
    programId = existing.id;
  } else if (data.program.create) {
    const newProgram = await prisma.program.create({
      data: {
        title: data.program.create.title,
        description: data.program.create.description ?? "",
        image: data.program.create.image,
      },
    });
    programId = newProgram.id;
  } else {
    throw badRequest("data.program.id");
  }

    // let imageUrl = courseData.thumbnail || "";

    // if (!imageUrl && !req.file) {
    //   logger.error("❌ Course image is required");
    //   return AppError(res, "Course image is required", 400);
    // }

    // if (req.file) {
    //   const uploadResult = await streamUpload(
    //     req.file.buffer,
    //     "pathfinder/images"
    //   );
    //   if (typeof uploadResult === "object" && "secure_url" in uploadResult) {
    //     imageUrl = uploadResult.secure_url as string;
    //   } else {
    //     logger.error("❌ Failed to upload image to Cloudinary");
    //     return errorResponse(res, "Failed to upload course image", 500);
    //   }
    // }

  const course = await prisma.course.create({
    data: {
      ...courseData,
      slug,
      // imageUrl,
      instructorId: data.instructorId ?? adminId ?? undefined,
      programId,
      pricings:
        data.type === "online" && data.pricings?.length
          ? {
              create: data.pricings.map((p) => ({
                duration: p.duration,
                price: p.price,
              })),
            }
          : undefined,
    },
    include: {
      pricings: true,
      program: true,
    },
  });

  return course;
}

export const listCourses = async (
  q?: string,
  type?: "online" | "physical",
  limit?: number,
  offset?: number
) => {
  const where: any = {};

  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      // { tags: { has: q } },
    ];
  }

  if (type) where.type = type;

  return prisma.course.findMany({
    where,
    take: limit ?? 20,
    skip: offset ?? 0,
    include: { program: true, pricings: true, enrollments: true },
    orderBy: { createdAt: "desc" },
  });
};

export const getCourse = async (id: string) => {
  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      program: true,
      pricings: true,
      modules: { include: { topics: true } },
      enrollments: true,
    },
  });
  if (!course) throw notFound("Course not found");
  return course;
};

export const updateCourse = async (
  id: string,
  data: Partial<CreateCourseInput>
) => {
  // disallow program reassign via simple update; require dedicated endpoint if needed
  const payload: any = { ...data };
  delete payload.program;
  if (data.slug) payload.slug = data.slug;

  const updated = await prisma.course.update({
    where: { id },
    data: payload,
    include: { program: true, pricings: true },
  });
  return updated;
};

export const deleteCourse = async (id: string) => {
  // cascades for pricings/modules/topics due to Prisma onDelete rules
  await prisma.course.delete({ where: { id } });
  return true;
};
