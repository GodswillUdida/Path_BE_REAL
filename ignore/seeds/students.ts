import {
  StudentRegistrationSource,
  StudentStatus,
  type Prisma,
} from "@prisma/client";
import type { SeedUsers } from "./users";

/**
 * Tier-2 markers. testUser + secondStudent become registered students.
 * Public-only accounts (e.g. pending.verify) stay without a profile.
 */
export async function seedStudentProfiles(tx: Prisma.TransactionClient, users: SeedUsers) {
  const { testUser, secondStudent, admin } = users;

  const profiles = await Promise.all(
    [testUser, secondStudent].map((u, i) =>
      tx.studentProfile.upsert({
        where: { userId: u.id },
        update: {},
        create: {
          userId: u.id,
          studentCode: `STU-${String(i + 1).padStart(4, "0")}`,
          status: StudentStatus.ACTIVE,
          registrationSource: StudentRegistrationSource.MANUAL,
          registeredById: admin.id,
        },
      }),
    ),
  );

  console.log("✅ StudentProfiles seeded");
  return profiles;
}