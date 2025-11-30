import { z } from "zod";

export const enrollmentSchema = z
  .object({
    email: z.string().email({ message: "Invalid email address" }),
    firstName: z.string().min(1, { message: "First name is required" }),
    lastName: z.string().min(1, { message: "Last name is required" }),
    phone: z
      .string()
      .min(10, { message: "Phone number must be at least 10 digits" })
      .max(15, { message: "Phone number must be at most 15 digits" })
      .regex(/^\+?\d+$/, { message: "Phone number format is invalid" }),

    courseId: z.string().optional(),
    subCourseId: z.string().optional(),
    
    paymentStatus: z
      .enum(["PENDING", "PAID", "FAILED", "REFUNDED"])
      .default("PENDING"),

    paymentRef: z.string().optional(),

    isActive: z.boolean().default(true),

    // Only needed for conditional logic (set in controller, not from user)
    hasSubCourses: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.hasSubCourses && !data.subCourseId) {
      ctx.addIssue({
        code: "custom",
        message: "subCourseId is required when the course has sub-courses",
        path: ["subCourseId"],
      });
    }
  });
