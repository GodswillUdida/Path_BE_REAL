import { Role } from "@prisma/client";

export interface GoogleProfile {
  id: string; // Google's unique user ID
  displayName?: string;
  emails: Array<{ value: string; verified: boolean }>;
  photos?: Array<{ value: string }>;
  _json: {
    email?: string;
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
  profileImage: string | null;
  studentProfile?: {
    status:
      | "ACTIVE"
      | "SUSPENDED"
      | "ALUMNI"
      | "WITHDRAWN"
      | "PENDING"
      | "REJECTED";
  } | null;
}

export interface AuthResult {
  tokens: AuthTokens;
  user: SessionUser;
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