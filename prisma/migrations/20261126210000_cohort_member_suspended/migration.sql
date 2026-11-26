-- AlterEnum: allow suspending a cohort membership without deleting history.
-- PostgreSQL requires ADD VALUE outside a transaction block in some versions;
-- Prisma wraps migrations in a transaction; ADD VALUE IF NOT EXISTS is safe on PG 15+.
ALTER TYPE "CohortMemberStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
