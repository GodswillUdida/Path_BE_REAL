import { compare, hash } from "bcryptjs";
import crypto from "crypto";

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

export async function hashPassword(password: string): Promise<string> {
  return await hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return await compare(password, hashedPassword);
}

export const hashToken = async (token: string): Promise<string> => {
  return hash(token, SALT_ROUNDS);
  // return crypto.createHash("sha256").update(token).digest("hex");
};

export const compareTokenHash = async (
  token: string,
  hash: string
): Promise<boolean> => {
  return compare(token, hash);
  // hashToken(token) === hashed;
};

// refresh token
export async function hashRefreshToken(token: string): Promise<string> {
  const saltRounds = 10;
  return await hash(token, saltRounds);
}