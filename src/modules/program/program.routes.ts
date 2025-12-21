// Example route JSDoc for docs generation (add to routes like program.routes.ts)
/**
 * @swagger
 * /programs/{slug}:
 *   get:
 *     summary: Retrieve a program by slug
 *     tags: [Programs]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: The program slug
 *     responses:
 *       200:
 *         description: The program details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 program:
 *                   type: object
 *                   # Add properties...
 *       404:
 *         description: Program not found
 *     security:
 *       - bearerAuth: []  # If protected
 */

import { Router } from "express";
import * as ctrl from "./program.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";
import uploadImage from "../../config/multer";

const r = Router();

r.post(
  "/",
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.createProgramController
);

r.post(
  "/:programId/courses/physical",
  uploadImage.single("thumbnail"),
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.createCourseFromProgramController
);

r.get("/", ctrl.listProgramsController);

r.get("/:id", ctrl.getProgramController);

r.get("/:slug", ctrl.getProgramBySlugController);

r.patch(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.updateProgramController
);

r.delete(
  "/:id",
  authGuard,
  roleGuard("admin", "superadmin"),
  ctrl.deleteProgramController
);

export default r;
