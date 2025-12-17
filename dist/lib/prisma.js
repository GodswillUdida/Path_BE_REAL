"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient({
    log: [
        "info",
        "warn",
        // "query",
        "error"
    ],
});
if (process.env.NODE_ENV !== "production")
    globalThis.prisma = prisma;
exports.default = prisma;
