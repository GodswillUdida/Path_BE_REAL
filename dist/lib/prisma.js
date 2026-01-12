"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
// declare global {
//   var prisma: PrismaClient | undefined;
// }
// const prisma = new PrismaClient({
//   log:
//     process.env.NODE_ENV === "production"
//       ? ["warn", "error"]
//       : ["info", "warn", "error"],
// });
const prisma = new client_1.PrismaClient();
// if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;
exports.default = prisma;
