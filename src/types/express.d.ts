import "express";
import type { Multer } from "multer";

declare global {
  namespace Express {
    interface Request {
      file?: Multer.File;
      files?: Multer.File[];
      user?: {
        id: string;
        role?: string;
      };
    }
  }
}

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      role: string;
      tokenId?: string; // for refresh tokens if needed
    };
  }
}