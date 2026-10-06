import { sign, verify } from "jsonwebtoken";

interface VerifiedTokenPayload {
  email: string;
  purpose: "guest-checkout";
  iat?: number;
  exp?: number;
}

export type AccessTokenPayload = {
  userId: string;
  role?: string;
  emailVerified?: boolean;
};

export type RefreshTokenPayload = {
  userId: string;
  role?: string;
  tokenId: string; // for rotation tracking (optional)
};

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

const VERIFIED_TOKEN_SECRET =
  process.env.VERIFIED_TOKEN_SECRET ?? process.env.JWT_SECRET!;
 
const VERIFIED_TOKEN_TTL_SECONDS = parseInt(process.env.VERIFIED_TOKEN_TTL_SECONDS ?? "300", 10);

if (!ACCESS_SECRET || !REFRESH_SECRET || !VERIFIED_TOKEN_SECRET) {
  throw new Error(
    "JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, and VERIFIED_TOKEN_SECRET must be configured"
  );
}

export function signVerifiedToken(payload: Omit<VerifiedTokenPayload, "iat" | "exp">): string {
  return sign(payload, VERIFIED_TOKEN_SECRET, {
    expiresIn: VERIFIED_TOKEN_TTL_SECONDS,
    issuer: "checkout-service",
  });
}

export function verifyVerifiedToken(token: string): VerifiedTokenPayload | null {
  try {
    return verify(token, VERIFIED_TOKEN_SECRET, {
      issuer: "checkout-service",
    }) as VerifiedTokenPayload;
  } catch {
    return null;
  }
}
 

export const signAccessToken = (payload: AccessTokenPayload) => {
  return sign(payload, ACCESS_SECRET, {
    expiresIn: "15m",
  });
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return verify(token, ACCESS_SECRET) as AccessTokenPayload;
};

export const signRefreshToken = (payload: RefreshTokenPayload) => {
  return sign(payload, REFRESH_SECRET, {
    expiresIn: "7d",
  });
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  return verify(token, REFRESH_SECRET) as RefreshTokenPayload;
};

export const verifyToken = (token: string, secret: string) => {
  return verify(token, secret);
};
