import type { Request, Response } from "express";
import { asyncHandler } from "@/utils/asyncHandler";
import { requireActor } from "@/utils/requireActor";
import { CohortMemberStatus } from "@prisma/client";
import {
  addCohortCourseSchema,
  assignInstructorSchema,
  createCohortOfferSchema,
  createCohortSchema,
  discoveryQuerySchema,
  grantMemberSchema,
  listCohortsQuerySchema,
  memberStatusSchema,
  transitionCohortSchema,
  updateCohortOfferSchema,
  updateCohortSchema,
} from "./cohort.schema";
import * as svc from "./cohort.service";

function parseStatus(q: unknown): CohortMemberStatus | undefined {
  if (typeof q !== "string" || !q) return undefined;
  if ((Object.values(CohortMemberStatus) as string[]).includes(q)) {
    return q as CohortMemberStatus;
  }
  return undefined;
}

export const createCohort = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = createCohortSchema.parse(req.body);
  const data = await svc.createCohortService(actor, input);
  res.status(201).json({ success: true, data });
});

export const updateCohort = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = updateCohortSchema.parse(req.body);
  const data = await svc.updateCohortService(actor, req.params.id, input);
  res.status(200).json({ success: true, data });
});

export const getCohort = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.getCohortService(req.params.id);
  res.status(200).json({ success: true, data });
});

export const getCohortBySlug = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.getCohortBySlugService(req.params.slug);
  res.status(200).json({ success: true, data });
});

export const listCohorts = asyncHandler(async (req: Request, res: Response) => {
  const query = listCohortsQuerySchema.parse(req.query);
  const result = await svc.listCohortsService(query);
  res.status(200).json({ success: true, data: result.data, meta: result.meta });
});

export const transitionCohort = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = transitionCohortSchema.parse(req.body);
  const data = await svc.transitionCohortService(actor, req.params.id, input);
  res.status(200).json({ success: true, data });
});

export const archiveCohort = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
  const data = await svc.archiveCohortService(actor, req.params.id, reason);
  res.status(200).json({ success: true, data });
});

export const deleteCohort = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  await svc.softDeleteCohortService(actor, req.params.id);
  res.status(200).json({ success: true, data: { deleted: true } });
});

export const getCapacity = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.getCapacityService(req.params.id);
  res.status(200).json({ success: true, data });
});

export const discoverCohorts = asyncHandler(async (req: Request, res: Response) => {
  const query = discoveryQuerySchema.parse(req.query);
  const result = await svc.discoverCohortsService(query);
  res.status(200).json({ success: true, data: result.data, meta: result.meta });
});

export const addCourse = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { courseId } = addCohortCourseSchema.parse(req.body);
  const data = await svc.addCourseService(actor, req.params.id, courseId);
  res.status(201).json({ success: true, data });
});

export const removeCourse = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  await svc.removeCourseService(actor, req.params.id, req.params.courseId);
  res.status(200).json({ success: true, data: { removed: true } });
});

export const listCourses = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.listCoursesService(req.params.id);
  res.status(200).json({ success: true, data });
});

export const createOffer = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = createCohortOfferSchema.parse(req.body);
  const data = await svc.createOfferService(actor, req.params.id, input);
  res.status(201).json({ success: true, data });
});

export const updateOffer = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = updateCohortOfferSchema.parse(req.body);
  const data = await svc.updateOfferService(actor, req.params.offerId, input);
  res.status(200).json({ success: true, data });
});

export const activateOffer = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const data = await svc.setOfferActiveService(actor, req.params.offerId, true);
  res.status(200).json({ success: true, data });
});

export const deactivateOffer = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const data = await svc.setOfferActiveService(actor, req.params.offerId, false);
  res.status(200).json({ success: true, data });
});

export const listOffers = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.listOffersService(req.params.id);
  res.status(200).json({ success: true, data });
});

export const getOffer = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.getOfferService(req.params.offerId, { publicView: true });
  res.status(200).json({ success: true, data });
});

export const getOfferAdmin = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.getOfferService(req.params.offerId, { publicView: false });
  res.status(200).json({ success: true, data });
});

export const grantMember = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const input = grantMemberSchema.parse(req.body);
  const data = await svc.grantMemberService(actor, req.params.id, input);
  res.status(201).json({ success: true, data });
});

export const listMembers = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const status = parseStatus(req.query.status);
  const result = await svc.listMembersService(req.params.id, { page, limit, status });
  res.status(200).json({ success: true, data: result.data, meta: result.meta });
});

export const getMember = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.getMemberService(req.params.memberId);
  res.status(200).json({ success: true, data });
});

export const suspendMember = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { reason } = memberStatusSchema.parse(req.body ?? {});
  const data = await svc.suspendMemberService(actor, req.params.memberId, reason);
  res.status(200).json({ success: true, data });
});

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { reason } = memberStatusSchema.parse(req.body ?? {});
  const data = await svc.removeMemberService(actor, req.params.memberId, reason);
  res.status(200).json({ success: true, data });
});

export const reactivateMember = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { reason } = memberStatusSchema.parse(req.body ?? {});
  const data = await svc.reactivateMemberService(actor, req.params.memberId, reason);
  res.status(200).json({ success: true, data });
});

export const completeMember = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { reason } = memberStatusSchema.parse(req.body ?? {});
  const data = await svc.completeMemberService(actor, req.params.memberId, reason);
  res.status(200).json({ success: true, data });
});

export const assignInstructor = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  const { userId } = assignInstructorSchema.parse(req.body);
  const data = await svc.assignInstructorService(actor, req.params.id, userId);
  res.status(201).json({ success: true, data });
});

export const removeInstructor = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireActor(req);
  await svc.removeInstructorService(actor, req.params.id, req.params.userId);
  res.status(200).json({ success: true, data: { removed: true } });
});

export const listInstructors = asyncHandler(async (req: Request, res: Response) => {
  const data = await svc.listInstructorsService(req.params.id);
  res.status(200).json({ success: true, data });
});
