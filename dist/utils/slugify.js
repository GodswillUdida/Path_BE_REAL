"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniqueSlug = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const slugify_1 = __importDefault(require("slugify"));
const generateUniqueSlug = async (base, model, existingId) => {
    const baseSlug = (0, slugify_1.default)(base, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;
    const modelMap = {
        program: prisma_1.default.program,
        course: prisma_1.default.course,
        module: prisma_1.default.module,
        topic: prisma_1.default.topic,
    };
    while (true) {
        const exists = await modelMap[model].findFirst({
            where: {
                slug,
                NOT: existingId ? { NOT: { id: existingId } } : undefined,
                // ...(existingId ? { NOT: { id: existingId } } : undefined),
            },
        });
        // const newSlug = `${baseSlug}-${counter}`;
        // exists = await (prisma[model] as any).findU({
        //   where: {
        //     slug: newSlug,
        //     ...(excludeId ? { NOT: { id: excludeId } } : {}),
        //   },
        // });
        if (!exists)
            break;
        // {
        slug = `${baseSlug}-${counter++}`;
        // }
    }
    return slug;
};
exports.generateUniqueSlug = generateUniqueSlug;
