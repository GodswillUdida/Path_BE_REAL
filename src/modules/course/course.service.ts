import prisma from "../../lib/prisma";
import { badRequest, notFound } from "../../utils/errors";
import { generateUniqueSlug } from "../../utils/slugify";
import { streamUpload } from "../../config/stream";
import logger from "../../utils/logger";
import type {
  CreateCourseInput,
  UpdateCourseInput,
  CoursePricingInput,
} from "./course.schema";
import redis from "../../config/redis";

/* -------------------- CREATE ONLINE COURSE -------------------- */
export async function createOnlineCourse(
  data: CreateCourseInput,
  adminId: string,
  fileBuffer?: Buffer,
  fileMime?: string,
) {
  if (data.type !== "online")
    throw badRequest("Only online courses allowed here");

  // Fetch program if assigned
  const program = data.programId
    ? await prisma.program.findUnique({ where: { id: data.programId } })
    : null;

  if (data.programId && !program) throw notFound("Program not found");

  // Handle thumbnail upload
  let thumbnail = data.thumbnail ?? "";
  if (fileBuffer) {
    if (!fileMime?.startsWith("image/")) throw badRequest("Invalid image type");
    try {
      const uploadResult = await streamUpload(
        fileBuffer,
        "pathfinder/images/courses",
      );
      thumbnail = uploadResult.secure_url;
    } catch (err) {
      logger.error("Thumbnail upload failed", err);
      throw badRequest("Failed to upload thumbnail");
    }
  } else if (!thumbnail) {
    throw badRequest("Thumbnail is required");
  }

  // Generate unique slug
  const slug = await generateUniqueSlug(data.slug ?? data.title, "course");

  // Prisma create course with pricing
  const course = await prisma.course.create({
    data: {
      title: data.title,
      description: data.description,
      slug,
      thumbnail,
      videoPreview: data.videoPreview ?? null,
      level: data.level ?? null,
      tags: data.tags,
      duration: data.duration ?? null,
      status: data.status ?? "DRAFT",
      programId: data.programId ?? null,
      instructorId: adminId,
      // type: "online",
      pricings: {
        create: data.pricings.map((p: CoursePricingInput) => ({
          name: p.name ?? null,
          price: p.price,
          currency: p.currency ?? "NGN",
          durationDays: p.durationDays,
          isActive: p.isActive ?? true,
        })),
      },
    },
    include: { pricings: true, program: true },
  });

  return course;
}

/* -------------------- GET COURSE -------------------- */
export async function getCourse(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      pricings: true,
      program: true,
      modules: true,
      enrollments: true,
      // modules: { include: { topics: true } },
    },
  });
  if (!course) throw notFound("Course not found");
  return course;
}

export async function getCourseBySlug(programSlug: string, courseSlug: string) {
  const program = await prisma.program.findUnique({
    where: { slug: programSlug },
  });
  if (!program) throw notFound("Program not found");

  const course = await prisma.course.findFirst({
    where: { slug: courseSlug, programId: program.id },
    include: {
      pricings: true,
      program: true,
      modules: { include: { topics: true } },
    },
  });

  if (!course) throw notFound("Course not found");
  return course;
}

/* -------------------- LIST COURSES -------------------- */
// export async function listCourses(
//   q?: string,
//   tag?: string,
//   type?: "online" | "physical",
//   limit = 20,
//   offset = 0,
// ) {
//   const where: any = {};

//   if (q)
//     where.OR = [
//       { title: { contains: q, mode: "insensitive" } },
//       { description: { contains: q, mode: "insensitive" } },
//     ];
//   if (tag) where.tags = { has: tag };
//   if (type) where.type = type;

//   return prisma.course.findMany({
//     where,
//     skip: offset,
//     take: limit,
//     include: { pricings: true, program: true, enrollments: true },
//     orderBy: { createdAt: "desc" },
//   });
// }

export async function listCourses(
  q?: string,
  tag?: string,
  limit = 20,
  offset = 0,
) {
  const where: any = { deletedAt: null };

  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  if (tag) where.tags = { has: tag };

  const cacheKey = `courses:${q ?? ""}:${tag ?? ""}:${limit}:${offset}`;

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const [total, courses] = await prisma.$transaction([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      skip: offset,
      take: limit,
      include: { pricings: true, program: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const result = {
    data: courses,
    meta: {
      total,
      limit,
      offset,
      pages: Math.ceil(total / limit),
    },
  };

  await redis.set(cacheKey, JSON.stringify(result), "EX", 60);

  return result;
}

/* -------------------- UPDATE COURSE -------------------- */
export async function updateCourse(
  id: string,
  data: UpdateCourseInput,
  fileBuffer?: Buffer,
  fileMime?: string,
) {
  const existing = await prisma.course.findUnique({
    where: { id },
    include: { pricings: true },
  });
  if (!existing) throw notFound("Course not found");

  let thumbnail = data.thumbnail ?? existing.thumbnail;
  if (fileBuffer) {
    if (!fileMime?.startsWith("image/")) throw badRequest("Invalid image type");
    try {
      const uploadResult = await streamUpload(
        fileBuffer,
        "pathfinder/images/courses",
      );
      thumbnail = uploadResult.secure_url;
    } catch (err) {
      logger.error("Thumbnail upload failed", err);
      throw badRequest("Failed to upload thumbnail");
    }
  }

  // Handle slug update
  let updatedSlug = existing.slug;
  if (data.title && !data.slug)
    updatedSlug = await generateUniqueSlug(data.title, "course", id);
  if (data.slug)
    updatedSlug = await generateUniqueSlug(data.slug, "course", id);

  // Update course
  const { pricings, ...updateData } = data;

  const updated = await prisma.course.update({
    where: { id },
    data: {
      ...updateData,
      slug: updatedSlug,
      thumbnail,
      instructorId: existing.instructorId!,
      ...(pricings && {
        pricings: {
          deleteMany: {},
          create: pricings.map((p: CoursePricingInput) => ({
            name: p.name ?? null,
            price: p.price,
            currency: p.currency ?? "NGN",
            durationDays: p.durationDays,
            isActive: p.isActive ?? true,
          })),
        },
      }),
    },
    include: { program: true, pricings: true },
  });

  // const updated = await prisma.course.update({
  //   where: { id },
  //   data: {
  //     ...data,
  //     slug: updatedSlug,
  //     thumbnail,
  //     instructorId: undefined,
  //   },
  //   include: { pricings: true, program: true },
  // });

  return updated;
}

/* -------------------- DELETE COURSE -------------------- */
export async function deleteCourse(id: string) {
  const existing = await prisma.course.findUnique({
    where: { id },
  });

  if (!existing) throw notFound("Course not found");

  await prisma.course.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return true;
}

export async function getCourseAnalytics(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId, deletedAt: null },
  });

  if (!course) throw notFound("Course not found");

  const [totalEnrollments, activePricings, revenue] = await prisma.$transaction(
    [
      prisma.enrollment.count({ where: { courseId } }),
      prisma.coursePricing.count({
        where: { courseId, isActive: true },
      }),
      prisma.orderItem.aggregate({
        _sum: { unitPrice: true },
        // where: { courseId },
      }),
    ],
  );

  return {
    totalEnrollments,
    activePricings,
    totalRevenue: revenue._sum!.unitPrice ?? 0,
  };
}
