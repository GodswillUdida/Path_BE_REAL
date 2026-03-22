import { sendVerificationEmail } from "../../services/emailService";
import prisma from "../../config/db";
import { compareTokenHash, hashPassword, hashToken } from "../../utils/hash";
import crypto from "crypto";
import { badRequest } from "../../utils/errors";
import { createSessionAndTokens } from "./auth.service";

const MAGIC_TTL = 15 * 60 * 1000;

// In magicLogin.service.ts — add this:
export const createMagicLoginToken = async (
  email: string,
): Promise<{ token: string }> => {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = await hashToken(token);

  await prisma.magicLoginToken.create({
    data: {
      email,
      tokenHash,
      used: false,
      expiresAt: new Date(Date.now() + MAGIC_TTL),
    },
  });

  return { token };
};

// export const sendMagicLogin = async (
//   email: string,
// ): Promise<{ token: string }> => {
//   const token = crypto.randomBytes(32).toString("hex");
//   const tokenHash = await hashToken(token);

//   await prisma.magicLoginToken.create({
//     data: {
//       email,
//       tokenHash,
//       used: false,
//       expiresAt: new Date(Date.now() + MAGIC_TTL), // 15 minutes
//     },
//   });

//   const loginUrl = `${process.env.FRONTEND_URL}/auth/magic-login?token=${token}&email=${email}`;

//   await sendVerificationEmail(email, "Student", token);

//   return { token };
// };

export const sendMagicLogin = async (
  email: string,
): Promise<{ message: string }> => {
  const { token } = await createMagicLoginToken(email);

  await sendVerificationEmail(email, "Student", token);

  return { message: "Magic login link sent" };
};

// export const verifyMagicLogin = async (email: string, token: string) => {
//   const tokens = await prisma.magicLoginToken.findMany({
//     where: {
//       email,
//       used: false,
//       expiresAt: { gt: new Date() },
//     },
//   });

//   let match = null;

//   for (const t of tokens) {
//     if (await compareTokenHash(token, t.tokenHash)) {
//       match = t;
//       break;
//     }
//   }

//   if (!match) throw badRequest("Invalid or expired login link");

//   await prisma.magicLoginToken.update({
//     where: { id: match.id },
//     data: { used: true },
//   });

//   let user = await prisma.user.findUnique({ where: { email } });

//   if (!user) {
//     user = await prisma.user.create({
//       data: {
//         email,
//         name: email.split("@")[0],
//         password: await hashPassword(crypto.randomBytes(32).toString("hex")),
//         emailVerified: true,
//       },
//     });
//   }

//   return createSessionAndTokens(user);
// };

export const verifyMagicLogin = async (email: string, token: string) => {
  const tokenHash = await hashToken(token);

  const magicToken = await prisma.magicLoginToken.findFirst({
    where: {
      email,
      tokenHash,
      used: false,
      expiresAt: { gt: new Date() },
    },
  });

  if (!magicToken) throw badRequest("Invalid or expired login link");

  await prisma.magicLoginToken.update({
    where: { id: magicToken.id },
    data: { used: true },
  });

  let user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
    },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: email.split("@")[0],
        password: await hashPassword(crypto.randomBytes(32).toString("hex")),
        emailVerified: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
      },
    });
  }

  return createSessionAndTokens(user);
};
 