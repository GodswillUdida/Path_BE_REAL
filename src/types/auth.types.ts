import { Role } from "@prisma/client";

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  emailVerified: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  tokens: AuthTokens;
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  emailVerified: boolean;
}

// ─── Request Meta ─────────────────────────────────────────────────────────────

export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
  fingerprint?: string;
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  email_verified: boolean;
}

export interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  id_token?: string;
}

// ─── OTP ──────────────────────────────────────────────────────────────────────

export interface OtpVerificationResult {
  verified: true;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface SessionView {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}
