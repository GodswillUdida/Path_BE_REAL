import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testPrisma, truncateAll } from "../setup/db";
import { authRepository } from "@/modules/auth/auth.repo";

describe("legacy credential recovery (repository level)", () => {
  beforeEach(truncateAll);
  afterAll(() => testPrisma.$disconnect());

  it("clears only credentials passwords so a verified-mailbox reset is the sole way back in", async () => {
    const user = await testPrisma.user.create({
      data: {
        email: "legacy@example.test",
        name: "Legacy",
        emailVerified: false,
        accounts: {
          create: [
            { provider: "credentials", providerId: "legacy@example.test", password: "attacker-chosen-hash" },
            { provider: "google", providerId: "g-123" },
          ],
        },
      },
    });

    await authRepository.clearCredentialPasswords(user.id);

    const accounts = await testPrisma.account.findMany({ where: { userId: user.id }, orderBy: { provider: "asc" } });
    expect(accounts.map((a) => [a.provider, a.password])).toEqual([
      ["credentials", null],
      ["google", null],
    ]);
  });
});
