import { Router } from "express";
import * as ctrl from "./program.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";
import uploadImage from "../../config/multer";

const r = Router();

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
r.post(
  "/",
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.createProgramController,
);

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
r.post(
  "/:programId/courses/physical",
  uploadImage.single("thumbnail"),
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.createCourseFromProgramController,
);

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
r.patch(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.updateProgramController,
);

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
r.delete(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.deleteProgramController,
);

export default r;
