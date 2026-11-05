// /**
//  * prisma/seed.ts — entry only.
//  * Domain seeds live under prisma/seeds/.
//  */

// import { prisma } from "./seeds/client";
// import { seedUsers } from "./seeds/users";
// import { seedPrograms } from "./seeds/programs";
// import { seedCourses } from "./seeds/courses";
// import { seedStudentProfiles } from "./seeds/students";
// import { seedCommerce } from "./seeds/commerce";
// import { seedCohorts } from "./seeds/cohorts";
// import { seedApplicants } from "./seeds/applicants";
// import { seedMeetingAccounts } from "./seeds/meeting-accounts";
// import { seedLiveSessions } from "./seeds/live-sessions";
// import { seedAnnouncements } from "./seeds/announcements";
// import { seedNotifications } from "./seeds/notifications";
// import { seedChat } from "./seeds/chat";

// async function main(): Promise<void> {
//   console.log("🌱 Starting database seed...");

//   await prisma.$transaction(
//     async (tx) => {
//       const users = await seedUsers(tx);
//       const programs = await seedPrograms(tx);
//       const courses = await seedCourses(tx, users, programs);
//       await seedStudentProfiles(tx, users);
//       await seedCommerce(tx, users, courses);
//       // await seedCohorts(tx, users, courses);
//       const cohortSeed = await seedCohorts(tx, users, courses);
//       if (cohortSeed) {
//         const meetingAccounts = await seedMeetingAccounts(tx);
//         await seedLiveSessions(
//           tx,
//           users,
//           cohortSeed.cohortId,
//           meetingAccounts[0].id,
//           cohortSeed.courseIds[0],
//         );
//         const { targeted } = await seedAnnouncements(
//           tx,
//           users,
//           cohortSeed.cohortId,
//           cohortSeed.courseIds[0],
//         );
//         await seedChat(tx, users, cohortSeed.cohortId);
//         await seedNotifications(
//           tx,
//           users,
//           targeted.id,
//           cohortSeed.seatEnrollmentId ?? undefined,
//         );
//       }
//       const applicantCount = await seedApplicants(tx);

//       console.log("\n🎉 Seed completed successfully!");
//       console.table({
//         Users: 6,
//         Programs: programs.length,
//         Courses: courses.length,
//         FreeCourses: courses.filter((c) => c.isFree).length,
//         Applicants: applicantCount,
//       });
//     },
//     { timeout: 180_000 },
//   );
// }

// const nodeProcess = (globalThis as typeof globalThis & {
//   process?: {
//     env?: { NODE_ENV?: string };
//     exit(code: number): never;
//   };
// }).process;
// const nodeEnv = nodeProcess?.env?.NODE_ENV;

// if (nodeEnv === "production") {
//   throw new Error("❌ Seeding is disabled in production");
// }

// main()
//   .then(async () => {
//     await prisma.$disconnect();
//   })
//   .catch(async (e: unknown) => {
//     console.error("❌ Seed failed:", e);
//     await prisma.$disconnect();
//     nodeProcess?.exit(1);
//   });