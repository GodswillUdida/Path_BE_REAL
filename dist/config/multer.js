"use strict";
// import { Request } from "express";
// import { AppError } from "../middleware/error";
// import multer, { FileFilterCallback } from "multer";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImage = void 0;
// const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB for images
// // ✅ Allowed image formats
// const allowedTypes = [
//   "image/jpeg",
//   "image/jpg",
//   "image/png",
//   "image/gif",
//   "image/webp",
// ];
// // ✅ File filter function for images
// const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
//   if (file.mimetype.startsWith("image/")) {
//     cb(null, true);
//   } else {
//     cb(
//       new Error("Only image files (jpeg, jpg, png, gif, webp) are allowed"),
//       false
//     );
//   }
// };
// const onlineStorage = multer.memoryStorage();
// // ✅ Multer upload instance for online image storage
// const uploadImage = multer({
//   storage: onlineStorage,
//   fileFilter: (_req, file, cb) => {
//     if (!file.mimetype.startsWith("image/")) {
//       return cb(new AppError("Only image files are allowed"));
//     }
//     cb(null, true);
//   },
//   limits: { fileSize: MAX_FILE_SIZE },
// }).single("thumbnail");
// export default uploadImage;
const multer_1 = __importDefault(require("multer"));
const error_1 = require("../middleware/error");
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
exports.uploadImage = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new error_1.AppError("Only image files (jpeg, png, webp, gif) are allowed", 400));
        }
        cb(null, true);
    },
});
exports.default = exports.uploadImage;
