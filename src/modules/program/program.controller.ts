/**
 * program.controller.ts
 *
 * HTTP adapter only. No business logic.
 *
 * Responsibilities:
 *   - Parse + validate request inputs via Zod
 *   - Resolve actor identity (id, role) from req.user via requireActor()
 *   - Delegate entirely to the service layer
 *   - Return a consistent JSON envelope
 *
 * Response envelope contract (all routes):
 *   Success: { success: true, data: T, meta?: PaginationMeta, message?: string }
 *   Error:   { success: false, message: string, code?: string, details?: unknown }
 *   (Errors are handled by the global error middleware — controllers never format errors)
 *
 * Note on idempotency: the previous idempotency implementation was broken —
 * the key was written but never marked "processed" (the update was commented out),
 * meaning every repeated request would re-execute. Idempotency for program creation
 * is handled correctly via the DB unique constraint on `title` + the application-level
 * check in the service. If you need HTTP-level idempotency (e.g., for payment flows),
 * implement it as a complete middleware (read → respond OR execute → write → respond)
 * before wiring it here.
 */

import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { unauthorized } from "../../utils/errors";
import {
  createProgramSchema,
  updateProgramSchema,
  listProgramsQuerySchema,
} from "./program.schema";
import * as svc from "./program.service";

// ─────────────────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────────────────

export const createProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    requireActor(req); // throws 401 if unauthenticated

    const body = createProgramSchema.parse(req.body);

    const program = await svc.createProgram({
      data: body,
      imageFile: req.file, // uploadSingleImage sets req.file
    });

    return res.status(201).json({
      success: true,
      message: "Program created successfully",
      data: program,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────────────────

export const listProgramsController = asyncHandler(
  async (req: Request, res: Response) => {
    const query = listProgramsQuerySchema.parse(req.query);
    const result = await svc.listPrograms(query);

    return res.json({ success: true, message: "Programs listed successfully", ...result });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET BY ID
// ─────────────────────────────────────────────────────────────────────────────

export const getProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const program = await svc.getProgram(req.params.id as string);
    return res.json({ success: true, message: "Program retrieved successfully", data: program });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET BY SLUG
//
// Intentionally served from a distinct URL prefix (/by-slug/:slug) rather
// than a bare /:slug param — this eliminates the route shadowing bug where
// Express treats /:id and /:slug as identical dynamic segments, making one
// of the two routes permanently unreachable.
// ─────────────────────────────────────────────────────────────────────────────

export const getProgramBySlugController = asyncHandler(
  async (req: Request, res: Response) => {
    const program = await svc.getProgramBySlug(req.params.slug as string);
    return res.json({ success: true, message: "Program retrieved successfully by slug", data: program });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE
// ─────────────────────────────────────────────────────────────────────────────

export const updateProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const { id: _actorId, role: actorRole } = requireActor(req);
    const body = updateProgramSchema.parse(req.body);

    const program = await svc.updateProgram({
      id: req.params.id as string,
      actorRole,
      data: body,
      imageFile: req.file,
    });

    return res.json({
      success: true,
      message: "Program updated successfully",
      data: program,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

export const deleteProgramController = asyncHandler(
  async (req: Request, res: Response) => {
    const { role: actorRole } = requireActor(req);

    await svc.deleteProgram({ id: req.params.id as string, actorRole });

    return res.json({
      success: true,
      message: "Program deleted successfully",
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Asserts req.user is set (authGuard must precede this controller).
 * Throws 401 — not 400 — when the actor is missing.
 * Returns typed {id, role} to avoid non-null assertions at call sites.
 */
function requireActor(req: Request): { id: string; role: string } {
  const user = req.user;
  if (!user?.id || !user?.role) throw unauthorized("Authentication required");
  return { id: user.id, role: user.role };
}