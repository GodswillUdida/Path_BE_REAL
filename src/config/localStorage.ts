import multer from "multer";
import path from "path";
import fs from "fs";

// Define upload directory
const uploadDir = path.join(__dirname, "../../uploads/images/");

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Multer storage setup (Local Uploads)
const localStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // Save videos to 'uploads/images/'
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

export default localStorage;
