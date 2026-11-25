/**
 * Rebuilds the test database from the repo's migration SQL (in order) and
 * then manual_constraints.sql, so tests run against the schema AND the
 * constraints Prisma cannot express. Refuses to run against anything that
 * is not clearly a test database.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const root = path.resolve(__dirname, "../..");

export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://pf:pf@localhost:55432/pf_test";
  const dbName = new URL(url).pathname.replace("/", "");
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to reset database "${dbName}": name must contain "test".`);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");

    const dir = path.join(root, "prisma/migrations");
    const migrations = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const name of migrations) {
      const file = path.join(dir, name, "migration.sql");
      if (!existsSync(file)) continue;
      try {
        await client.query(readFileSync(file, "utf8"));
      } catch (err) {
        throw new Error(`Migration ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await client.query(readFileSync(path.join(root, "manual_constraints.sql"), "utf8"));
  } finally {
    await client.end();
  }
}
