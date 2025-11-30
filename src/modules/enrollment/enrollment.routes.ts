import { Router } from "express";
import * as ctrl from "./enrollment.controller";
import { authGuard } from "../../middleware/authGuard";

const r = Router();

r.post("/", authGuard, ctrl.createEnrollment);
r.get("/mine", authGuard, ctrl.getMyEnrollments);
r.get("/:id", authGuard, ctrl.getOne);

export default r;