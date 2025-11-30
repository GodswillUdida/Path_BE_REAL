import { sign, verify } from "jsonwebtoken";

export type AccessTokenPayload = {
  userId: string;
  role?: string;
};

export type RefreshTokenPayload = {
  userId: string;
  tokenId: string; // for rotation tracking (optional)
};

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error(
    "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be configured"
  );
}

export const signAccessToken = (payload: object) => {
  return sign(payload, ACCESS_SECRET, {
    expiresIn: "15m",
  });
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return verify(token, ACCESS_SECRET) as AccessTokenPayload;
};

export const signRefreshToken = (payload: object) => {
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
