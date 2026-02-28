// import prisma from "../../config/db";

// export const userRepo = {
//   findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),

//   findById: (id: string) => prisma.user.findUnique({ where: { id } }),

//   create: (data: any) => prisma.user.create({ data }),

//   update: (id: string, data: any) =>
//     prisma.user.update({ where: { id }, data }),
// };

// export const refreshTokenRepo = {
//   create: (data: any) => prisma.refreshToken.create({ data }),

//   findByTokenId: (tokenId: string) =>
//     prisma.refreshToken.findUnique({ where: { tokenId } }),

//   revoke: (id: string) =>
//     prisma.refreshToken.update({
//       where: { id },
//       data: { revoked: true },
//     }),

//   revokeAllForUser: (userId: string) =>
//     prisma.refreshToken.updateMany({
//       where: { userId },
//       data: { revoked: true },
//     }),
// };
