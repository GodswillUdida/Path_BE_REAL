// src/types/express.d.ts
import "express";
import "passport";

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

declare global {
  namespace Express {
    // What Passport (and your JWT middleware) put on req.user
    interface User {
      userId: string;
      id: string;
      role: string;
      tokenId?: string;
    }

    // Keep the Request augmentation as well (belt & suspenders)
    interface Request {
      user?: User;
    }
  }
}

// Also augment the core module (your original approach)
declare module "express-serve-static-core" {
  interface Request {
    user?: {
      userId: string;
      id: string;
      role: string;
      tokenId?: string;
    };
  }
}

export {};