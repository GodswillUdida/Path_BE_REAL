import multer, { FileFilterCallback } from "multer";
import { Request } from "express";
import path from "path";

// ✅ Define accepted MIME types for images
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "image/svg+xml",
];

// ✅ Memory storage for multer
// This allows us to handle the file in memory before uploading to Cloudinary or local storage
const storage = multer.memoryStorage();

// ✅ Image-only file filter
const imageFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype || ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

// ✅ Multer upload middleware for single image
const uploadImage = multer({
  storage,
  fileFilter: imageFilter,
  // ✅ Set file size limit to 5MB
  limits: {
    fileSize: 5 * 1024 * 1024, // ✅ 5MB max
  },
}).single("image");

export default uploadImage;
