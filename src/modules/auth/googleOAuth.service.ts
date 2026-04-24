import { OAuth2Client } from "google-auth-library";
import { badRequest } from "../../utils/errors";
import { hashPassword } from "../../utils/hash";
import { randomBytes } from "crypto";
import prisma from "../../lib/prisma";
import { AuthResult } from "./types";
import { createSessionAndTokens } from "./auth.service";

const client = new OAuth2Client(process.env.G_ID);

export const loginWithGoogle = async (idToken: string): Promise<AuthResult> => {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.G_ID,
  });

  const payload = ticket.getPayload();

  if (!payload?.email || !payload.email_verified) {
    throw badRequest("Invalid Google token");
  }

  const { email, name, picture, sub } = payload;

  const user = await prisma.user.upsert({
    where: { email },

    update: {
      googleId: sub,
      name: name || undefined,
      profileImage: picture || undefined,
      emailVerified: true,
    },

    create: {
      email,
      name: name || email.split("@")[0] || "Google User",
      googleId: sub,
      profileImage: picture,
      emailVerified: true,
      password: await hashPassword(randomBytes(32).toString("hex")),
    },

    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerified:true
    },
  });

  return createSessionAndTokens(user);
};
