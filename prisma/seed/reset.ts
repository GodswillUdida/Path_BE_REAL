import type { PrismaClient } from "@prisma/client";

/** Truncates every table in the current schema except Prisma's migration history. */
export async function resetDatabase(db: PrismaClient): Promise<number> {
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return 0;

  const list = rows.map((r) => `"${r.tablename.replace(/"/g, '""')}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  return rows.length;
}   