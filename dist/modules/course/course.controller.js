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
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCourseController = exports.courseAnalyticsController = exports.updateCourseController = exports.getCourseBySlugController = exports.getCourseController = exports.listCoursesController = exports.createCourseController = void 0;
const svc = __importStar(require("./course.service"));
const course_schema_1 = require("./course.schema");
const errors_1 = require("../../utils/errors");
const asyncHandler_1 = require("../../utils/asyncHandler");
/* -------------------- CREATE COURSE -------------------- */
exports.createCourseController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { programId } = req.params;
    if (!programId)
        throw (0, errors_1.badRequest)("programId is required");
    // Handle pricing JSON if multipart/form-data
    let pricings = req.body.pricings;
    if (typeof pricings === "string") {
        try {
            pricings = JSON.parse(pricings);
        }
        catch {
            throw (0, errors_1.badRequest)("Invalid pricings format");
        }
    }
    const parsed = course_schema_1.createCourseSchema.parse({
        ...req.body,
        programId,
        pricings: req.body.pricings ? JSON.parse(req.body.pricings) : undefined,
    });
    const file = req.file;
    const instructorId = req.user?.id;
    if (!instructorId)
        throw (0, errors_1.badRequest)("Unauthorized");
    const course = await svc.createOnlineCourse(parsed, instructorId, file?.buffer, file?.mimetype);
    return res.status(201).json({
        success: true,
        message: "Course created successfully",
        data: course,
    });
});
/* -------------------- LIST COURSES -------------------- */
exports.listCoursesController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const query = course_schema_1.listCoursesQuery.parse(req.query);
    const result = await svc.listCourses(query.q, query.tag, 
    // undefined,
    query.limit, query.offset);
    return res.json({
        success: true,
        ...result,
    });
});
/* -------------------- GET COURSE BY ID -------------------- */
exports.getCourseController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const course = await svc.getCourse(req.params.id);
    return res.json({
        success: true,
        data: course,
    });
});
/* -------------------- GET COURSE BY SLUG -------------------- */
exports.getCourseBySlugController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { programSlug, courseSlug } = req.params;
    const course = await svc.getCourseBySlug(programSlug, courseSlug);
    return res.json({
        success: true,
        data: course,
    });
});
/* -------------------- UPDATE COURSE -------------------- */
exports.updateCourseController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    let pricings = req.body.pricings;
    if (typeof pricings === "string") {
        try {
            pricings = JSON.parse(pricings);
        }
        catch {
            throw (0, errors_1.badRequest)("Invalid pricings format");
        }
    }
    const parsed = course_schema_1.updateCourseSchema.parse({
        ...req.body,
        pricings,
    });
    const updated = await svc.updateCourse(req.params.id, parsed, req.file?.buffer, req.file?.mimetype);
    return res.json({
        success: true,
        message: "Course updated successfully",
        data: updated,
    });
});
exports.courseAnalyticsController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const analytics = await svc.getCourseAnalytics(req.params.id);
    return res.json({
        success: true,
        data: analytics,
    });
});
/* -------------------- DELETE COURSE -------------------- */
exports.deleteCourseController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await svc.deleteCourse(req.params.id);
    return res.json({
        success: true,
        message: "Course deleted successfully",
    });
});
