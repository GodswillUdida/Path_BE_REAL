import { createHash } from "node:crypto";

export const SEED_NOW = process.env.SEED_NOW ? new Date(process.env.SEED_NOW) : new Date();

export function sid(key: string): string {
  const h = createHash("sha256").update(`pathfinder-seed:${key}`).digest("hex");
  return [
    h.slice(0, 8), h.slice(8, 12), "4" + h.slice(13, 16),
    ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + h.slice(18, 20),
    h.slice(20, 32),
  ].join("-");
}

export const addMinutes = (d: Date, m: number): Date => new Date(d.getTime() + m * 60_000);
export const daysFromNow = (days: number, from = SEED_NOW): Date => new Date(from.getTime() + days * 86_400_000);
export const daysAgo = (days: number, from = SEED_NOW): Date => daysFromNow(-days, from);
export const inDays = daysFromNow;
export const atUtc = (dayOffset: number, hour: number, from = SEED_NOW): Date =>
  new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + dayOffset, hour));

export function expiresAtFor(days: number | null, bonusDays: number, from: Date): Date | null {
  return days === null ? null : daysFromNow(days + bonusDays, from);
}

export const payRef = (key: string): string =>
  `PSK_SEED_${sid(`ref:${key}`).replace(/-/g, "").slice(0, 16).toUpperCase()}`;