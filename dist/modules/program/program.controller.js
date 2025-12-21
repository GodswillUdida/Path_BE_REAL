"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProgramController = exports.updateProgramController = exports.getProgramBySlugController = exports.getProgramController = exports.listProgramsController = exports.createCourseFromProgramController = exports.createProgramController = void 0;
const program_schema_1 = require("./program.schema");
const zod_1 = __importDefault(require("zod"));
const svc = __importStar(require("./program.service"));
const createProgramController = async (req, res, next) => {
    try {
        const body = program_schema_1.createProgramSchema.parse(req.body);
        console.log("Incoming create program payload:", req.body);
        const program = await svc.createProgram(body);
        res.status(201).json({ success: true, program });
    }
    catch (error) {
        next(error);
    }
};
exports.createProgramController = createProgramController;
const createCourseFromProgramController = async (req, res, next) => {
    try {
        const { programId } = req.params;
        const course = await svc.createCourseFromProgramId({
            programId,
            type: req.body.type,
            payload: req.body,
            adminId: req.user.id,
            fileBuffer: req.file?.buffer,
            fileMime: req.file?.mimetype,
        });
        res.status(201).json({ course });
    }
    catch (error) {
        next(error);
    }
};
exports.createCourseFromProgramController = createCourseFromProgramController;
const listProgramsController = async (_req, res, next) => {
    try {
        const programs = await svc.listPrograms();
        res.json({
            success: true,
            count: programs.length,
            programs,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.listProgramsController = listProgramsController;
const getProgramController = async (req, res, next) => {
    try {
        const id = req.params.id;
        const program = await svc.getProgram(id);
        res.json({ success: true, program });
    }
    catch (error) {
        next(error);
    }
};
exports.getProgramController = getProgramController;
const getProgramBySlugController = async (req, res, next) => {
    const slugSchema = zod_1.default.object({
        slug: zod_1.default
            .string()
            .min(1)
            .max(255)
            .regex(/^[a-z0-9-]+$/i, "Invalid slug format"), // Security: Restrict to safe characters
    });
    try {
        const { slug } = slugSchema.parse(req.params);
        console.log("Validating Slug from params: ", slug);
        const program = await svc.getProgramBySlug(slug);
        if (!program) {
            return res.status(404).json({
                success: false,
                message: "Program not found",
            });
        }
        res.status(200).json({
            success: true,
            program,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getProgramBySlugController = getProgramBySlugController;
const updateProgramController = async (req, res, next) => {
    try {
        const id = req.params.id;
        const body = req.body;
        const program = await svc.updateProgram(id, body);
        res.json({ success: true, program });
    }
    catch (error) {
        next(error);
    }
};
exports.updateProgramController = updateProgramController;
const deleteProgramController = async (req, res, next) => {
    try {
        const id = req.params.id;
        await svc.deleteProgram(id);
        res.json({ success: true, message: "Program deleted" });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteProgramController = deleteProgramController;
