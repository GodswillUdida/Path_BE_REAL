import { Role, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker";

export type SeedUsers = Awaited<ReturnType<typeof seedUsers>>;

export async function seedUsers(tx: Prisma.TransactionClient) {
  const testUser = await tx.user.upsert({
    where: { email: "test@example.com" },
    update: {},
    create: {
      name: "Test Student",
      email: "test@example.com",
      emailVerified: true,
      role: Role.student,
      profileImage: "https://randomuser.me/api/portraits/men/32.jpg",
    },
  });

  const secondStudent = await tx.user.upsert({
    where: { email: "jane.student@example.com" },
    update: {},
    create: {
      name: "Jane Adeyemi",
      email: "jane.student@example.com",
      emailVerified: true,
      role: Role.student,
      profileImage: "https://randomuser.me/api/portraits/women/44.jpg",
    },
  });

  await tx.user.upsert({
    where: { email: "pending.verify@example.com" },
    update: {},
    create: {
      name: "Unverified Student",
      email: "pending.verify@example.com",
      emailVerified: false,
      role: Role.student,
    },
  });

  const instructor = await tx.user.upsert({
    where: { email: "instructor@academy.com" },
    update: {},
    create: {
      name: faker.person.fullName(),
      email: "instructor@academy.com",
      emailVerified: true,
      role: Role.instructor,
    },
  });

  const secondInstructor = await tx.user.upsert({
    where: { email: "instructor2@academy.com" },
    update: {},
    create: {
      name: faker.person.fullName(),
      email: "instructor2@academy.com",
      emailVerified: true,
      role: Role.instructor,
    },
  });

  const admin = await tx.user.upsert({
    where: { email: "admin@academy.com" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@academy.com",
      emailVerified: true,
      role: Role.admin,
    },
  });

  for (const user of [testUser, admin]) {
    await tx.account.upsert({
      where: {
        provider_providerId: { provider: "credentials", providerId: user.email },
      },
      update: {},
      create: {
        userId: user.id,
        provider: "credentials",
        providerId: user.email,
        password: await bcrypt.hash("Password123", 12),
      },
    });
  }

  console.log("✅ Users seeded");
  return { testUser, secondStudent, instructor, secondInstructor, admin };
}