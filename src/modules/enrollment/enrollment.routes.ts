// enrollment.routes.ts

import { Router } from "express";
import {
  getMyEnrollments,
  getOneEnrollment,
} from "./enrollment.controller";
import { authGuard } from "../../middleware/authGuard";

const router = Router();

router.get("/enrollments", authGuard, getMyEnrollments);

router.get("/enrollments/:id", authGuard, getOneEnrollment);

export default router;