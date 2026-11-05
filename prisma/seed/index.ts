/**
 * prisma/seed/index.ts
 *
 * Seed for local / staging. Run:
 *   npx prisma db seed                 idempotent: safe to run repeatedly
 *   npx prisma db seed -- --reset      wipe every table first, then seed
 *
 * Properties:
 *  - IDEMPOTENT. Rows get stable ids derived from keys, and inserts skip or
 *    upsert, so a second run adds nothing and a crashed run can be re-run.
 *  - DETERMINISTIC. faker is seeded: same names and durations on every
 *    fresh database. (Timestamps are relative to the run, so data stays
 *    "current".)
 *  - SAFE. Refuses NODE_ENV=production and non-local databases unless
 *    explicitly allowed (see guard.ts).
 *  - SCHEMA-ACCURATE. Every row satisfies the database CHECK constraints in
 *    manual_constraints.sql, so the seed doubles as a smoke test of them.
 *  - VideoAssets and resources are created READY: no worker runs here.
 *
 * Wire-up (package.json):
 *   "prisma": { "seed": "tsx prisma/seed/index.ts" }
 */

import { PrismaClient } from "@prisma/client";
import { SEED_PASSWORD } from "./config";
import type { SeedCtx, SeedStep } from "./context";
import { assertSafeToReset, assertSafeToSeed } from "./guard";
import { resetDatabase } from "./reset";
import { seedUsers } from "./steps/01-users";
import { seedCatalog } from "./steps/02-catalog";
import { seedCommerce } from "./steps/03-commerce";
import { seedStudents } from "./steps/04-students";
import { seedLive } from "./steps/05-live";
import { seedCommunity } from "./steps/06-community";
import { seedAudit } from "./steps/07-audit";

// Order matters: each step reads what earlier steps put in the context.
const STEPS: { name: string; run: SeedStep }[] = [
  { name: "users", run: seedUsers },
  { name: "catalog", run: seedCatalog },
  { name: "commerce", run: seedCommerce },
  { name: "students", run: seedStudents },
  { name: "live", run: seedLive },
  { name: "community", run: seedCommunity },
  { name: "audit", run: seedAudit },
];

async function main(): Promise<void> {

  const reset = process.argv.includes("--reset");

  if (reset) assertSafeToReset();
  else assertSafeToSeed();

  const db = new PrismaClient({ log: ["warn", "error"] });
  const started = Date.now();

  try {
    if (reset) {
      const tables = await resetDatabase(db);
      console.log(`Reset: truncated ${tables} tables`);
    }

    console.log("Seeding...");
    const ctx: SeedCtx = { db, users: {}, courses: {}, programs: {}, cohorts: {}, offers: {}, sessions: {}, rooms: {} };

    for (const step of STEPS) {
      const t = Date.now();
      console.log(`[${step.name}]`);
      await step.run(ctx);
      console.log(`  done in ${Date.now() - t}ms`);
    }

    const [users, courses, orders, payments, enrollments, cohorts, members, sessions, messages] = await db.$transaction([
      db.user.count(), db.course.count(), db.order.count(), db.payment.count(), db.enrollment.count(),
      db.cohort.count(), db.cohortMember.count(), db.liveSession.count(), db.chatMessage.count(),
    ]);
    console.log(`\nSeed complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.table({ users, courses, orders, payments, enrollments, cohorts, cohortMembers: members, liveSessions: sessions, chatMessages: messages });
    console.log(`Sign in as any seeded user with password "${SEED_PASSWORD}". For example:`);
    console.table([
      { tier: "staff", email: "admin@academy.com" },
      { tier: "staff", email: "instructor@academy.com" },
      { tier: "1 public buyer", email: "test@example.com" },
      { tier: "2 registered student", email: "ada.student@example.com" },
      { tier: "2 suspended student", email: "tunde.student@example.com" },
    ]);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exitCode = 1;
});