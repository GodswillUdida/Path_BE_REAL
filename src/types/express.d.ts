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
