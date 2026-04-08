// enrollment.routes.ts

import { Router } from "express";
import {
  getMyEnrollments,
  getOneEnrollment,
} from "./enrollment.controller";
import { authGuard } from "../../middleware/authGuard";

const r = Router();


r.get("/", authGuard, getMyEnrollments);

r.get("/:id", authGuard, getOneEnrollment);

export default r;