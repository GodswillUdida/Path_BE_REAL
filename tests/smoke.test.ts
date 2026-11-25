import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testPrisma, truncateAll } from "./setup/db";

describe("test harness", () => {
  beforeAll(truncateAll);
  afterAll(() => testPrisma.$disconnect());

  it("has the migrated schema", async () => {
    expect(await testPrisma.cohort.count()).toBe(0);
  });

  it("has manual constraints applied", async () => {
    const rows = await testPrisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conname IN ('cohort_dates_valid','enrollment_source_consistency')`;
    expect(rows.map((r) => r.conname).sort()).toEqual(["cohort_dates_valid", "enrollment_source_consistency"]);
  });

  it("serializes concurrent transactions on an advisory lock", async () => {
    // Two txs take the same lock; the second must wait for the first.
    const order: string[] = [];
    const run = (label: string, holdMs: number) =>
      testPrisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('harness', 0))`;
        order.push(`${label}:in`);
        await new Promise((r) => setTimeout(r, holdMs));
        order.push(`${label}:out`);
      });
    const a = run("A", 150);
    await new Promise((r) => setTimeout(r, 30));
    const b = run("B", 0);
    await Promise.all([a, b]);
    expect(order).toEqual(["A:in", "A:out", "B:in", "B:out"]);
  });
});
