import { authGuard } from "@/middleware/authGuard";
import { Router } from "express";
import { getCourseProgressAdminController, getEnrollmentProgressController, getProgressSummaryController, getSingleProgressController, markTopicCompleteController, resetProgressController, upsertProgressController } from "./progress.controller";
import { roleGuard } from "@/middleware/roleGuard";


const r = Router();

r.post("/", authGuard, upsertProgressController);

r.patch("/:enrollmentId/topics/:topicId/complete", authGuard, markTopicCompleteController);

r.get("/:enrollmentId", authGuard, getEnrollmentProgressController);

r.get(
    "/:enrollmentId/topics/:topicId",
    authGuard,
    getSingleProgressController
);

r.delete(
    "/:enrollmentId/reset",
    authGuard,
    resetProgressController
);

r.get("/summary", authGuard, getProgressSummaryController);

r.get(
    "/admin/courses/:courseId",
    authGuard,
    roleGuard("admin", "superadmin", "instructor"),
    getCourseProgressAdminController
);

export default r;