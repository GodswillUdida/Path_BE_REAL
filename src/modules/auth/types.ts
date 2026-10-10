import { Role } from "@prisma/client";

export interface GoogleProfile {
  id: string; // Google's unique user ID
  displayName?: string;
  emails: Array<{ value: string; verified: boolean }>;
  photos?: Array<{ value: string }>;
  _json: {
    email_verified: boolean;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  emailVerified: boolean;
}

export interface AuthResult {
  tokens: AuthTokens;
  user: Required<SessionUser>;
}

export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
  fingerprint?: string;
}

export interface PaginatedUsers {
  users: SessionUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SessionView {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
}