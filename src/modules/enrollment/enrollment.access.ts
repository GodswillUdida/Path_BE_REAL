/**
 * enrollment.access.ts
 *
 * The ONE definition of "does this enrollment grant access right now".
 * Enrollment.status alone is not enough: nothing flips ACTIVE -> EXPIRED
 * at the exact expiry instant, so access must always be evaluated from
 * status + startedAt + expiresAt. Use this in list/detail responses, the
 * video playback guard, and the cohort AccessPolicy.
 */

import type { EnrollmentStatus } from "@prisma/client";

export interface AccessWindow {
  status: EnrollmentStatus;
  startedAt: Date;
  expiresAt: Date | null; // null = lifetime
}

export function hasActiveAccess(e: AccessWindow, now: Date = new Date()): boolean {
  if (e.status !== "ACTIVE") return false;
  if (e.startedAt > now) return false;
  return e.expiresAt === null || e.expiresAt > now;
}

export type WithAccess<T extends AccessWindow> = T & { hasAccess: boolean };

export function withAccess<T extends AccessWindow>(e: T, now: Date = new Date()): WithAccess<T> {
  return { ...e, hasAccess: hasActiveAccess(e, now) };
}