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
const express_1 = require("express");
const ctrl = __importStar(require("./program.controller"));
const authGuard_1 = require("../../middleware/authGuard");
const roleGuard_1 = require("../../middleware/roleGuard");
const multer_1 = __importDefault(require("../../config/multer"));
const r = (0, express_1.Router)();
/**
 * @swagger
 * /programs:
 *   post:
 *     summary: Create a new program
 *     tags: [Programs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProgramDTO'
 *     responses:
 *       201:
 *         description: Program created successfully
 *       400:
 *         description: Bad request / validation error
 *     security:
 *       - bearerAuth: []
 */
r.post("/", authGuard_1.authGuard, (0, roleGuard_1.roleGuard)("admin", "superadmin"), ctrl.createProgramController);
/**
 * @swagger
 * /programs/{programId}/courses/physical:
 *   post:
 *     summary: Create a physical course under a program
 *     tags: [Programs]
 *     parameters:
 *       - in: path
 *         name: programId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               thumbnail:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Course created successfully
 *     security:
 *       - bearerAuth: []
 */
r.post("/:programId/courses/physical", multer_1.default.single("thumbnail"), authGuard_1.authGuard, (0, roleGuard_1.roleGuard)("admin", "superadmin", "instructor"), ctrl.createCourseFromProgramController);
/**
 * @swagger
 * /programs:
 *   get:
 *     summary: List all programs
 *     tags: [Programs]
 *     responses:
 *       200:
 *         description: List of programs
 */
r.get("/", ctrl.listProgramsController);
/**
 * @swagger
 * /programs/{id}:
 *   get:
 *     summary: Get a program by ID
 *     tags: [Programs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Program details
 */
r.get("/:id", ctrl.getProgramController);
/**
 * @swagger
 * /programs/{slug}:
 *   get:
 *     summary: Get a program by slug
 *     tags: [Programs]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Program details
 *       404:
 *         description: Program not found
 */
r.get("/:slug", ctrl.getProgramBySlugController);
/**
 * @swagger
 * /programs/{id}:
 *   patch:
 *     summary: Update a program
 *     tags: [Programs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProgramDTO'
 *     responses:
 *       200:
 *         description: Program updated
 *     security:
 *       - bearerAuth: []
 */
r.patch("/:id", authGuard_1.authGuard, (0, roleGuard_1.roleGuard)("admin", "superadmin"), ctrl.updateProgramController);
/**
 * @swagger
 * /programs/{id}:
 *   delete:
 *     summary: Delete a program
 *     tags: [Programs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Program deleted
 *     security:
 *       - bearerAuth: []
 */
r.delete("/:id", authGuard_1.authGuard, (0, roleGuard_1.roleGuard)("admin", "superadmin"), ctrl.deleteProgramController);
exports.default = r;
