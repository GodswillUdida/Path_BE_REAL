import prisma from "../../lib/prisma";
import type {
  CreateCourseInput,
  OnlineCourseInput,
  PhysicalCourseInput,
} from "./course.schema";
import { badRequest, notFound } from "../..//utils/errors";
import { generateUniqueSlug } from "../../utils/slugify";
import { streamUpload } from "../../config/stream";
import logger from "../../utils/logger";

export async function createOnlineCourse(
  programSlug: string,
  data: OnlineCourseInput,
  adminId: string,
  fileBuffer?: Buffer,
  fileMime?: string
) {
  const program = await prisma.program.findUnique({
    where: { slug: programSlug },
  });

  if (!program) throw notFound("Program not found");

  let thumbnail = data.thumbnail ?? "";

  if (fileBuffer) {
    if (!fileMime?.startsWith("image/")) {
      throw badRequest("Invalid image file type");
    }
    try {
      const uploadResult = await streamUpload(
        fileBuffer,
        "pathfinder/images/courses"
      );
      thumbnail = uploadResult.secure_url;
    } catch (err) {
      logger.error("Failed to upload image", err);
      throw badRequest("Failed to upload image");
    }
  } else if (!thumbnail) {
    throw badRequest("Thumbnail URL or file is required");
  }

  if (!thumbnail) throw badRequest("Thumbnail/Image is required");

  if (data.type !== "online") {
    throw badRequest("Only online course allowed for this endpoint");
  }

  const slug = await generateUniqueSlug(data.title, "course");

  const course = await prisma.course.create({
    data: {
      ...data,
      slug,
      thumbnail,
      type: "online",
      level: data.level,
      duration: data.duration,
      tags: data.tags,
      category: data.category,
      videoPreview: data.videoPreview,
      programId: program.id,
      instructorId: adminId,
      pricings: {
        create: data.pricings.map((p) => ({
          duration: p.duration,
          price: p.price,
        })),
      },
    },
    include: {
      program: true,
      pricings: true,
    },
  });
  return course;
}

export const createPhysicalCourse = async (
  programSlug: string,
  data: PhysicalCourseInput,
  adminId: string,
  fileBuffer?: Buffer,
  fileMime?: string
) => {
  const program = await prisma.program.findUnique({
    where: { slug: programSlug },
  });

  if (!program) throw notFound("Program not found");

  let thumbnail = data.thumbnail ?? "";
  // const { secure_url, public_id }: any = await streamUpload(req);

  if (fileBuffer) {
    if (!fileMime?.startsWith("image/")) {
      throw badRequest("Invalid image file type");
    }
    try {
      const uploadResult = await streamUpload(
        fileBuffer,
        "pathfinder/images/physical-courses"
      );
      thumbnail = uploadResult.secure_url;
    } catch (err) {
      logger.error("Failed to upload image", err);
      throw badRequest("Failed to upload image");
    }
  } else if (!thumbnail) {
    throw badRequest("Thumbnail URL or file is required");
  }
  // const { secure_url } = await streamUpload(
  //       fileBuffer,
  //       "pathfinder/images/physical-courses"
  //     );

  if (!thumbnail) throw badRequest("Thumbnail/Image is required");

  const slug = await generateUniqueSlug(data.title, "course");

  if (data.type !== "physical") {
    throw badRequest("Invalid course type for this endpoint");
  }

  const physicalCourse = await prisma.course.create({
    data: {
      // ...data,
      title: data.title,
      description: data.description,
      slug,
      thumbnail,
      type: "physical",
      level: data.level,
      duration: data.duration,
      tags: data.tags,
      category: data.category,
      location: data.location,
      schedule: data.schedule,
      programId: program.id,
      instructorId: adminId,
    },
    include: {
      program: true,
    },
  });
  return physicalCourse;
};

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

export const getCourseBySlug = async (
  programSlug: string,
  courseSlug: string
) => {
  const program = await prisma.program.findUnique({
    where: { slug: programSlug },
  });
  if (!program) throw notFound("Program not found");

  const course = await prisma.course.findFirst({
    where: { slug: courseSlug, programId: program.id },
    include: {
      program: true,
      pricings: true,
      modules: { include: { topics: true } },
    },
  });
  if (!course) throw notFound("Course not found");

  return course;
};

export const updateCourse = async (
  id: string,
  data: Partial<CreateCourseInput>,
  fileBuffer?: Buffer,
  fileMime?: string
) => {
  // disallow program reassign via simple update; require dedicated endpoint if needed
  const payload: any = { ...data };
  delete payload.program;

  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) throw badRequest("Course not found");

  let thumbnail = data.thumbnail ?? existing.thumbnail;

  if (fileBuffer) {
    if (!fileMime?.startsWith("image/")) {
      throw badRequest("Invalid image file type");
    }
    try {
      const uploadResult = await streamUpload(
        fileBuffer,
        "pathfinder/images/courses"
      );
      thumbnail = uploadResult.secure_url;
    } catch (err) {
      logger.error("Failed to upload image", err);
      throw badRequest("Failed to upload image");
    }
  }

  let updatedSlug = existing.slug;

  if (data.title && !data.slug) {
    updatedSlug = await generateUniqueSlug(data.title, "course", id);
    payload.slug = updatedSlug;
  }

  if (data.slug) {
    updatedSlug = await generateUniqueSlug(data.slug, "course");
    payload.slug = updatedSlug;
  }

  const updated = await prisma.course.update({
    where: { id },
    data: {
      ...payload,
      slug: updatedSlug,
      thumbnail,
    },
    include: { program: true, pricings: true },
  });
  return updated;
};

export const deleteCourse = async (id: string) => {
  await prisma.course.delete({ where: { id } });
  return true;
};
