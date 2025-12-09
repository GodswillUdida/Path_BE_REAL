import { Router } from "express";
import * as ctrl from "./enrollmentRequest.controller";


const r = Router();

// PHYSICAL ENROLLMENT REQUEST (PUBLIC)

r.post(
  "/request",
  //   validate(CreatePhysicalEnrollmentRequestSchema),
  ctrl.createPhysicalEnrollmentRequest
);
r.get("/request/all", ctrl.listPhysicalRequests);

export default r;