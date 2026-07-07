import { Request, Response } from "express";
import * as progressService from "./progress.service";
import { asyncHandler } from "@/utils/asyncHandler";

// ─── Student controllers ──────────────────────────────────────────────────────

/**
 * POST /progress
 * Upsert a progress record (update watchedSeconds, auto-complete, or mark done).
 * Body: { enrollmentId, topicId, watchedSeconds?, completed? }
 */
export const upsertProgressController = asyncHandler(
    async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { enrollmentId, topicId, watchedSeconds, completed } = req.body;

        const progress = await progressService.upsertProgress(
            { enrollmentId, topicId, watchedSeconds, completed },
            userId
        );

        res.status(200).json({
            success: true,
            message: "Progress updated.",
            data: progress,
        });
    }
);

/**
 * PATCH /progress/:enrollmentId/topics/:topicId/complete
 * Mark a specific topic as complete (or incomplete via body flag).
 * Body: { completed? }  — defaults to true
 */
export const markTopicCompleteController = asyncHandler(
    async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { enrollmentId, topicId } = req.params;
        const completed = req.body.completed !== false; // default true

        const progress = await progressService.markTopicComplete(
            enrollmentId as string,
            topicId as string,
            userId,
            completed
        );

        res.status(200).json({
            success: true,
            message: completed ? "Topic marked as complete." : "Topic marked as incomplete.",
            data: progress,
        });
    }
);

/**
 * GET /progress/:enrollmentId
 * Get all progress records for an enrollment, with summary stats.
 */
export const getEnrollmentProgressController = asyncHandler(
    async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { enrollmentId } = req.params;

        const data = await progressService.getProgressByEnrollment(enrollmentId as string, userId);

        res.status(200).json({
            success: true,
            data,
        });
    }
);

/**
 * GET /progress/:enrollmentId/topics/:topicId
 * Get progress for a single topic within an enrollment.
 */
export const getSingleProgressController = asyncHandler(
    async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { enrollmentId, topicId } = req.params;

        const progress = await progressService.getSingleProgress(
            enrollmentId as string,
            topicId as string,
            userId
        );

        res.status(200).json({
            success: true,
            data: progress ?? null,
            started: progress !== null,
        });
    }
);

/**
 * DELETE /progress/:enrollmentId/reset
 * Reset (delete) all progress for an enrollment.
 */
export const resetProgressController = asyncHandler(
    async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { enrollmentId } = req.params;

        const result = await progressService.resetEnrollmentProgress(enrollmentId as string, userId);

        res.status(200).json({
            success: true,
            message: `Progress reset. ${result.deletedCount} record(s) deleted.`,
            data: result,
        });
    }
);

export const getProgressSummaryController = asyncHandler(
    async (req: Request, res: Response) => {
        const userId = req.user!.id;

        const result = await progressService.getProgressSummary(userId);

        console.log("Summary: ", result);

        res.status(200).json({
            success: true,
            message: "Progress Summary Availiable",
            data: result,
        });
    }
)

// ─── Admin controllers ────────────────────────────────────────────────────────

/**
 * GET /admin/progress/courses/:courseId
 * Get aggregated progress for all students on a course.
 */
export const getCourseProgressAdminController = asyncHandler(
    async (req: Request, res: Response) => {
        const { courseId } = req.params;

        const data = await progressService.getCourseProgressAdmin(courseId as string);

        res.status(200).json({
            success: true,
            count: data.length,
            data,
        });
    }
);