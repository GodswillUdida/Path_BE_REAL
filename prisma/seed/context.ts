import type { Course, Cohort, CohortOffer, Program, User, MeetingAccount, Prisma, PrismaClient } from "@prisma/client";

export type SeedUser = { id: string; email: string; name: string | null; key: string };

export type SeedPricing = {
  id: string; accessDurationDays: number | null; bonusDays: number;
  price: Prisma.Decimal; isFree: boolean; name: string | null;
};

export type SeedCourse = {
  id: string;
  slug: string;
  title: string;
  issuesCertificate: boolean;
  pricings: Record<
    string, // "free" | "7" | "30" | "90" | "lifetime"
    SeedPricing
  >;
};

export type SeedCohort = {
  id: string; key: string; name: string; startsAt: Date; endsAt: Date;
  courseSlugs: string[];
  memberIds: string[]; // ACTIVE members, filled by 04. Not an audience: see 06 below.
};

export type SeedCtx = {
  db: PrismaClient;
  users: Record<string, SeedUser>;
  programs: Record<string, { id: string; slug: string }>;
  courses: Record<string, SeedCourse>;
  cohorts: Record<string, SeedCohort>;
  offers: Record<string, { id: string; cohortKey: string; price: number; bonusDays: number }>;
  sessions: Record<string, string>;
  rooms: Record<string, string>;
};

export type SeedContext = {
  users: {
    test: User;
    jane: User;
    lifetime: User;
    tunde: User;
    bola: User;
    instructor: User;
    instructor2: User;
    admin: User;
    bulk: User[];
  };
  programs: Program[];
  courses: Map<string, Course>; // key = slug
  cohorts: {
    evening: Cohort;
    weekend: Cohort;
    completed: Cohort;
  };
  offers: {
    evening: CohortOffer;
    weekend: CohortOffer;
  };
  meetingAccounts: MeetingAccount[];
  enrollmentIds: {
    paid30d?: string;
    lifetime?: string;
    free?: string;
    revoked?: string;
    expiredByDate?: string;
    expiredStatus?: string;
    seatEvening?: string;
  };
};

export type SeedStep = (ctx: SeedCtx) => Promise<void>;