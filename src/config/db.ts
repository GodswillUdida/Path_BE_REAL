import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  // keep query logging off by default; enable via env when debugging
  log: process.env.DB_LOG_LEVEL === "query" ? ["query"] : [],
});

export default prisma;
