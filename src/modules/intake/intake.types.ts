// Domain types for intake module
import { ApplicantStatus } from '@prisma/client';

export interface CreateApplicantInput {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  lectureCenter?: string;
  previousCenter?: string;
  isNewStudent: boolean;
  level?: string;
  careerChallenges?: string;
  referredBy?: string;
  documents?: string[];
  papers: string[]; // Array of paper names
  employment?: {
    placeOfWork?: string;
    position?: string;
  };
  sponsor?: {
    name?: string;
    phone?: string;
    email?: string;
    location?: string;
    workplace?: string;
  };
}

export interface UpdateApplicantInput {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  lectureCenter?: string;
  previousCenter?: string;
  level?: string;
  careerChallenges?: string;
  referredBy?: string;
  documents?: string[];
  papers?: string[];
  employment?: {
    placeOfWork?: string;
    position?: string;
  };
  sponsor?: {
    name?: string;
    phone?: string;
    email?: string;
    location?: string;
    workplace?: string;
  };
}

export interface ApplicantResponse {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  lectureCenter: string | null;
  previousCenter: string | null;
  isNewStudent: boolean;
  level: string | null;
  careerChallenges: string | null;
  referredBy: string | null;
  documents: string[];
  status: ApplicantStatus;
  createdAt: Date;
  updatedAt: Date;
  papers: Array<{
    id: string;
    paperName: string;
  }>;
  employment?: {
    id: string;
    placeOfWork: string | null;
    position: string | null;
  } | null;
  sponsor?: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    location: string | null;
    workplace: string | null;
  } | null;
}

export interface ListApplicantsQuery {
  page?: number;
  limit?: number;
  status?: ApplicantStatus;
  search?: string; // search by name/email/phone
  sortBy?: 'createdAt' | 'fullName';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}