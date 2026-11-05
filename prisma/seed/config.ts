export const SEED_VALUE = 20260723;
export const SEED_PASSWORD = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.SEED_PASSWORD ?? "Password123";
export const BONUS_DAYS = 30;
export const DAY_MS = 86_400_000;
export const BULK_STUDENTS = 12;


if (BULK_STUDENTS < 11) throw new Error("BULK_STUDENTS must be >= 11 (04 references student01..student11)");

export const SIZES = {
  bulkStudents: 8,
  modulesPerCourse: { min: 4, max: 7 },
  topicsPerModule: { min: 3, max: 6 },
} as const;

/** Stable emails used across steps and docs. */
export const EMAILS = {
  test: "test@example.com",
  jane: "jane.student@example.com",
  lifetime: "lifetime.buyer@example.com",
  tunde: "tunde.suspended@example.com",
  bola: "bola.alumni@example.com",
  instructor: "instructor@academy.com",
  instructor2: "instructor2@academy.com",
  admin: "admin@academy.com",
  pending: "pending.verify@example.com",
} as const;