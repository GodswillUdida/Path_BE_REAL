import multer from "multer";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB for images

// ✅ Allowed image formats
const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// ✅ File filter function for images
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (jpeg, png, gif, webp) are allowed"), false);
  }
};

// ✅ Local storage setup for images
const localStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/images/"); // Save images locally
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${Date.now()}- + ${uniqueSuffix} + ${file.originalname}`);
  },
});

// ✅ Multer upload instance for local image storage
const uploadImage = multer({
  storage: localStorage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

export default uploadImage;
