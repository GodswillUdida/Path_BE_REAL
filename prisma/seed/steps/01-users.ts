import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker";
import type { Role } from "@prisma/client";
import type { SeedCtx, SeedUser } from "../context";
import { BULK_STUDENTS, SEED_PASSWORD, SEED_VALUE } from "../config";
import { sid } from "../lib/helpers";

interface UserSpec {
  key: string;
  email: string;
  name: string;
  role: Role;
  verified: boolean;
  credentials?: boolean;
  phone?: string;
  image?: string;
}

/**
 * Staff, Tier-1 public buyers, named Tier-2 students, and bulk CSV students.
 * Every credentials account uses SEED_PASSWORD.
 */
export async function seedUsers(ctx: SeedCtx): Promise<void> {
  const { db } = ctx;
  faker.seed(SEED_VALUE + 1);

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  const specs: UserSpec[] = [
    {
      key: "admin",
      email: "admin@academy.com",
      name: "Admin User",
      role: "admin",
      verified: true,
      credentials: true,
    },
    {
      key: "instructor",
      email: "instructor@academy.com",
      name: "Tolu Adebayo",
      role: "instructor",
      verified: true,
      credentials: true,
    },
    {
      key: "instructor2",
      email: "instructor2@academy.com",
      name: "Nneka Okeke",
      role: "instructor",
      verified: true,
      credentials: true,
    },
    // Tier 1 — public buyers (no StudentProfile in step 04)
    {
      key: "test",
      email: "test@example.com",
      name: "Test Student",
      role: "student",
      verified: true,
      credentials: true,
      image: "https://randomuser.me/api/portraits/men/32.jpg",
    },
    {
      key: "jane",
      email: "jane.student@example.com",
      name: "Jane Adeyemi",
      role: "student",
      verified: true,
      credentials: true,
      image: "https://randomuser.me/api/portraits/women/44.jpg",
    },
    {
      key: "lifetime",
      email: "lifetime.buyer@example.com",
      name: "Kunle Lifetime",
      role: "student",
      verified: true,
      credentials: true,
    },
    {
      key: "pending",
      email: "pending.verify@example.com",
      name: "Unverified Student",
      role: "student",
      verified: false,
    },
    // Tier 2 — named registered students (profiles in step 04)
    {
      key: "ada",
      email: "ada.student@example.com",
      name: "Ada Okonkwo",
      role: "student",
      verified: true,
      credentials: true,
      phone: "+2348020000001",
    },
    {
      key: "chidi",
      email: "chidi.student@example.com",
      name: "Chidi Eze",
      role: "student",
      verified: true,
      credentials: true,
    },
    {
      key: "ngozi",
      email: "ngozi.student@example.com",
      name: "Ngozi Nwosu",
      role: "student",
      verified: true,
      credentials: true,
    },
    {
      key: "tunde",
      email: "tunde.student@example.com",
      name: "Tunde Bakare",
      role: "student",
      verified: true,
      credentials: true,
    },
    {
      key: "bola",
      email: "bola.alumni@example.com",
      name: "Bola Adeyemi",
      role: "student",
      verified: true,
      credentials: true,
    },
  ];

  for (let i = 0; i < BULK_STUDENTS; i++) {
    const n = String(i + 1).padStart(2, "0");
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    specs.push({
      key: `student${n}`,
      email: `student${n}@seed.example`,
      name: `${first} ${last}`,
      role: "student",
      verified: true,
      credentials: i < 3, // a few can sign in for chat tests
    });
  }

  let created = 0;
  for (const s of specs) {
    const id = sid(`user:${s.key}`);
    const row = await db.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        id,
        email: s.email,
        name: s.name,
        role: s.role,
        emailVerified: s.verified,
        phone: s.phone ?? null,
        profileImage: s.image ?? null,
      },
      select: { id: true, email: true, name: true },
    });

    const user: SeedUser = {
      id: row.id,
      email: row.email,
      name: row.name,
      key: s.key,
    };
    ctx.users[s.key] = user;

    if (s.credentials) {
      await db.account.upsert({
        where: {
          provider_providerId: { provider: "credentials", providerId: s.email },
        },
        update: {},
        create: {
          id: sid(`account:${s.key}`),
          userId: row.id,
          provider: "credentials",
          providerId: s.email,
          password: passwordHash,
        },
      });
    }
    created++;
  }

  console.log(`  users: ${created} accounts (password "${SEED_PASSWORD}" where credentials)`);
}