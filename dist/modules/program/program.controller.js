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
const asyncHandler_1 = require("../../utils/asyncHandler");
exports.createProgramController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = program_schema_1.createProgramSchema.parse(req.body);
    const program = await svc.createProgram(body);
    res.status(201).json({
        success: true,
        message: "Program created successfully",
        program,
    });
});
exports.createCourseFromProgramController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { programId } = req.params;
    const course = await svc.createCourseFromProgramId({
        programId,
        type: req.body.type,
        payload: req.body,
        adminId: req.user.id,
        fileBuffer: req.file?.buffer,
        fileMime: req.file?.mimetype,
    });
    res.status(201).json({
        success: true,
        message: "Course created successfully",
        course,
    });
});
exports.listProgramsController = (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const programs = await svc.listPrograms();
    res.json({
        success: true,
        count: programs.length,
        programs,
    });
});
exports.getProgramController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const program = await svc.getProgram(id);
    res.status(200).json({
        success: true,
        program,
    });
});
exports.getProgramBySlugController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const slugSchema = zod_1.default.object({
        slug: zod_1.default
            .string()
            .min(1)
            .max(255)
            .regex(/^[a-z0-9-]+$/i, "Invalid slug format"),
    });
    const { slug } = slugSchema.parse(req.params);
    const program = await svc.getProgramBySlug(slug);
    res.status(200).json({
        success: true,
        program,
    });
});
exports.updateProgramController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const body = program_schema_1.updateProgramSchema.parse(req.body);
    const program = await svc.updateProgram(id, body);
    res.status(200).json({
        success: true,
        message: "Program updated successfully",
        program,
    });
});
exports.deleteProgramController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    await svc.deleteProgram(id);
    res.status(200).json({
        success: true,
        message: "Program deleted successfully",
    });
});
