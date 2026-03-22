import { compare, hash } from "bcryptjs";
import crypto from "crypto";

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

export async function hashPassword(password: string): Promise<string> {
  return await hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hashedPassword: string,
): Promise<boolean> {
  return await compare(password, hashedPassword);
}

export const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export const compareTokenHash = (token: string, stored: string): boolean => {
  // Constant-time comparison prevents timing attacks
  const incoming = crypto.createHash("sha256").update(token).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(incoming, "hex"),
    Buffer.from(stored, "hex"),
  );
};

// refresh token
export async function hashRefreshToken(token: string): Promise<string> {
  return crypto.createHash("sha256").update(token).digest("hex");
}