/**
 * Cohort routes.
 *
 * Public / authenticated discovery:  /api/v1/cohorts/...
 * Admin mutations:                   /api/v1/admin/cohorts/...
 */

import { Router } from "express";
import { authGuard } from "@/middleware/authGuard";
import { roleGuard } from "@/middleware/roleGuard";
import { freshRoleGuard } from "@/middleware/freshRoleGuard";
import * as ctrl from "./cohort.controller";

const staffRead = roleGuard("admin", "superadmin");
const staffWrite = freshRoleGuard("admin", "superadmin");

/** Public + authenticated discovery (no admin secrets). */
export const cohortPublicRouter = Router();

cohortPublicRouter.get("/discover", ctrl.discoverCohorts);
cohortPublicRouter.get("/slug/:slug", ctrl.getCohortBySlug);
cohortPublicRouter.get("/offers/:offerId", ctrl.getOffer);

/** Admin router — mount at /api/v1/admin/cohorts */
export const cohortAdminRouter = Router();

// List / create
cohortAdminRouter.get("/", authGuard, staffRead, ctrl.listCohorts);
cohortAdminRouter.post("/", authGuard, staffWrite, ctrl.createCohort);

// Nested resources before /:id where needed
cohortAdminRouter.get("/:id/capacity", authGuard, staffRead, ctrl.getCapacity);
cohortAdminRouter.get("/:id/courses", authGuard, staffRead, ctrl.listCourses);
cohortAdminRouter.post("/:id/courses", authGuard, staffWrite, ctrl.addCourse);
cohortAdminRouter.delete("/:id/courses/:courseId", authGuard, staffWrite, ctrl.removeCourse);

cohortAdminRouter.get("/:id/offers", authGuard, staffRead, ctrl.listOffers);
cohortAdminRouter.post("/:id/offers", authGuard, staffWrite, ctrl.createOffer);
cohortAdminRouter.patch("/offers/:offerId", authGuard, staffWrite, ctrl.updateOffer);
cohortAdminRouter.post("/offers/:offerId/activate", authGuard, staffWrite, ctrl.activateOffer);
cohortAdminRouter.post("/offers/:offerId/deactivate", authGuard, staffWrite, ctrl.deactivateOffer);

cohortAdminRouter.get("/:id/members", authGuard, staffRead, ctrl.listMembers);
cohortAdminRouter.post("/:id/members", authGuard, staffWrite, ctrl.grantMember);
cohortAdminRouter.get("/members/:memberId", authGuard, staffRead, ctrl.getMember);
cohortAdminRouter.post("/members/:memberId/suspend", authGuard, staffWrite, ctrl.suspendMember);
cohortAdminRouter.post("/members/:memberId/remove", authGuard, staffWrite, ctrl.removeMember);
cohortAdminRouter.post("/members/:memberId/reactivate", authGuard, staffWrite, ctrl.reactivateMember);
cohortAdminRouter.post("/members/:memberId/complete", authGuard, staffWrite, ctrl.completeMember);

cohortAdminRouter.get("/:id/instructors", authGuard, staffRead, ctrl.listInstructors);
cohortAdminRouter.post("/:id/instructors", authGuard, staffWrite, ctrl.assignInstructor);
cohortAdminRouter.delete("/:id/instructors/:userId", authGuard, staffWrite, ctrl.removeInstructor);

cohortAdminRouter.post("/:id/transition", authGuard, staffWrite, ctrl.transitionCohort);
cohortAdminRouter.post("/:id/archive", authGuard, staffWrite, ctrl.archiveCohort);
cohortAdminRouter.get("/:id", authGuard, staffRead, ctrl.getCohort);
cohortAdminRouter.patch("/:id", authGuard, staffWrite, ctrl.updateCohort);
cohortAdminRouter.delete("/:id", authGuard, staffWrite, ctrl.deleteCohort);

export default cohortAdminRouter;
