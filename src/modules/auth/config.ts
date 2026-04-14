// auth/config.ts  ← create this file
import type { CookieOptions, Response } from "express";

export const COOKIE = {
  ACCESS_NAME: process.env.ACCESS_COOKIE_NAME ?? "access_token",
  REFRESH_NAME: process.env.REFRESH_COOKIE_NAME ?? "refresh_token",

  BASE_OPTIONS: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
    domain:
      process.env.NODE_ENV === "production"
        ? process.env.COOKIE_DOMAIN
        : undefined,
  } as const,

  ACCESS_MAX_AGE: 15 * 60 * 1000, // 15 minutes
  REFRESH_MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

export const setAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void => {
  // Refresh token – long-lived, httpOnly
  res.cookie(COOKIE.REFRESH_NAME, tokens.refreshToken, {
    ...COOKIE.BASE_OPTIONS,
    maxAge: COOKIE.REFRESH_MAX_AGE,
  });

  // Access token – short-lived (optional cookie + body)
  res.cookie(COOKIE.ACCESS_NAME, tokens.accessToken, {
    ...COOKIE.BASE_OPTIONS,
    maxAge: COOKIE.ACCESS_MAX_AGE,
  });
};

export const clearAuthCookies = (res: Response): void => {
  res.cookie(COOKIE.ACCESS_NAME, "", { ...COOKIE.BASE_OPTIONS, maxAge: 0 });
  res.cookie(COOKIE.REFRESH_NAME, "", { ...COOKIE.BASE_OPTIONS, maxAge: 0 });
};
