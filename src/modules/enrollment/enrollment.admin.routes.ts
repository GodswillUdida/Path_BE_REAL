// enrollment.admin.routes.ts  (mount at /v1/admin/enrollments)

import { Router } from "express";
import { grantEnrollment } from "./enrollment.admin.controller";
import { authGuard } from "../../middleware/authGuard";
import { freshRoleGuard } from "../../middleware/freshRoleGuard";

const r = Router();

// console.log("--- DEBUGGING ROUTE HANDLERS ---");
// console.log("authGuard:", typeof authGuard, authGuard);
// console.log("freshRoleGuard wrapper output:", typeof freshRoleGuard("admin", "superadmin"));
// console.log("grantEnrollment:", typeof grantEnrollment, grantEnrollment);
// console.log("---------------------------------");

r.post("/grants", authGuard, freshRoleGuard("admin", "superadmin"), grantEnrollment);

export default r;