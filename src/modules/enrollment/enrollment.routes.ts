import { Router } from "express";
import * as ctrl from "./enrollment.controller";
import { authGuard } from "../../middleware/authGuard";
// import { validate } from "../../middleware/validate";
import { CreateEnrollmentSchema } from "./enrollment.schema";

const r = Router();

// validate(CreateEnrollmentSchema),

r.post("/", authGuard,  ctrl.createEnrollment);
r.get("/mine", authGuard, ctrl.getMyEnrollments);
r.get("/:id", authGuard, ctrl.getOne);



export default r;