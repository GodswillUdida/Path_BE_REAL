import { Router } from "express";
import * as ctrl from "./enrollmentRequest.controller";
import { authGuard } from "../../middleware/authGuard";
import { roleGuard } from "../../middleware/roleGuard";

const r = Router();

// PHYSICAL ENROLLMENT REQUEST (PUBLIC)

r.post(
  "/:courseId/enroll",
  //   validate(CreatePhysicalEnrollmentRequestSchema),
  ctrl.createPhysicalEnrollmentRequest
);
r.get(
  "/request/:id",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.getSingleRequest
);

r.get(
  "/all",
  authGuard,
  roleGuard("admin", "superadmin", "instructor"),
  ctrl.listPhysicalRequests
);

export default r;
