import "express";
import type { Multer } from "multer";

// export interface MulterFiles {
//   videoPreview?: Express.Multer.File[];
//   thumbnail?: Express.Multer.File[];
// }

export type MulterFiles = {
  videoPreview?: Express.Multer.File[];
  thumbnail?: Express.Multer.File[];
};

export type MediaInput = {
  thumbnailFile?: Express.Multer.File;
  videoFile?: Express.Multer.File;
  thumbnailUrl?: string;
  videoUrl?: string;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      userId: string;
      id: string;
      role: string;
      tokenId?: string; // for refresh tokens if needed
    };
  }
}