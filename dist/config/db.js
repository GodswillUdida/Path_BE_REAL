"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient({
    // keep query logging off by default; enable via env when debugging
    log: process.env.DB_LOG_LEVEL === "query" ? ["query"] : [],
});
exports.default = prisma;
