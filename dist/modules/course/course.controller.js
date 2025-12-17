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
exports.deleteCourseController = exports.updateCourseController = exports.getCourseBySlugController = exports.getCourseController = exports.listCoursesController = exports.createPhysicalCourseController = exports.createOnlineCourseController = void 0;
const svc = __importStar(require("./course.service"));
const course_schema_1 = require("./course.schema");
const errors_1 = require("../../utils/errors");
const createOnlineCourseController = async (req, res, next) => {
    try {
        const { programSlug } = req.params;
        const body = course_schema_1.createCourseSchema.parse({
            ...req.body,
            type: "online",
            pricings: req.body.pricings ? JSON.parse(req.body.pricings) : undefined,
        });
        if (body.type !== "online") {
            throw (0, errors_1.badRequest)("Invalid course type for online endpoint");
        }
        const course = await svc.createOnlineCourse(programSlug, body, req.user.id, req.file?.buffer, req.file?.mimetype);
        res.status(201).json({
            success: true,
            course,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createOnlineCourseController = createOnlineCourseController;
const createPhysicalCourseController = async (req, res, next) => {
    try {
        const { programSlug } = req.params;
        const body = course_schema_1.createCourseSchema.parse({ ...req.body, type: "physical" });
        if (body.type !== "physical") {
            throw (0, errors_1.badRequest)("Invalid course type for physical endpoint");
        }
        const course = await svc.createPhysicalCourse(programSlug, body, req.user.id, req.file?.buffer, req.file?.mimetype);
        res.status(201).json({ success: true, course });
    }
    catch (error) {
        next(error);
    }
};
exports.createPhysicalCourseController = createPhysicalCourseController;
const listCoursesController = async (req, res, next) => {
    try {
        const query = course_schema_1.listCoursesQuery.parse(req.query);
        const courses = await svc.listCourses(query.q, query.type, query.limit, query.offset);
        res.json({ success: true, courses });
    }
    catch (error) {
        next(error);
    }
};
exports.listCoursesController = listCoursesController;
const getCourseController = async (req, res, next) => {
    try {
        const course = await svc.getCourse(req.params.id);
        res.json({ success: true, course });
    }
    catch (error) {
        next(error);
    }
};
exports.getCourseController = getCourseController;
const getCourseBySlugController = async (req, res, next) => {
    try {
        const course = await svc.getCourseBySlug(req.params.programSlug, req.params.courseSlug);
        res.json({ success: true, course });
    }
    catch (error) {
        next(error);
    }
};
exports.getCourseBySlugController = getCourseBySlugController;
const updateCourseController = async (req, res, next) => {
    try {
        const body = course_schema_1.updateCourseSchema.parse(req.body);
        const updated = await svc.updateCourse(req.params.id, body, req.file?.buffer, req.file?.mimetype);
        res.json({ success: true, updated });
    }
    catch (error) {
        next(error);
    }
};
exports.updateCourseController = updateCourseController;
const deleteCourseController = async (req, res, next) => {
    try {
        await svc.deleteCourse(req.params.id);
        res.json({ success: true, message: "Deleted" });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteCourseController = deleteCourseController;
