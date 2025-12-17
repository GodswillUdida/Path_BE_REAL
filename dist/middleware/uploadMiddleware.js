"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
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
const storage = multer_1.default.memoryStorage();
// ✅ Image-only file filter
const imageFilter = (_req, file, cb) => {
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype || ext)) {
        cb(null, true);
    }
    else {
        cb(new Error("Only image files are allowed"));
    }
};
// ✅ Multer upload middleware for single image
const uploadImage = (0, multer_1.default)({
    storage,
    fileFilter: imageFilter,
    // ✅ Set file size limit to 5MB
    limits: {
        fileSize: 5 * 1024 * 1024, // ✅ 5MB max
    },
}).single("image");
exports.default = uploadImage;
