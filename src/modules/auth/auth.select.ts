import type { Prisma } from "@prisma/client";

export const sessionUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  emailVerified: true,
  profileImage: true,
  studentProfile: { select: { status: true } },
} satisfies Prisma.UserSelect;

/** Derived from the select, so the type cannot drift from what the DB returns. */
export type SessionUser = Prisma.UserGetPayload<{
  select: typeof sessionUserSelect;
}>;