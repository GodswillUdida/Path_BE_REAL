import { config } from "dotenv";
config();

const CLOUDINARY_ENV = {
  
}

let cloudinaryInstance: typeof import("cloudinary").v2 | null = null;

export const getCloudinary = async () => {
  if (!cloudinaryInstance) {
    const { v2 } = await import("cloudinary");
    cloudinaryInstance = v2;

    cloudinaryInstance.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
      api_key: process.env.CLOUDINARY_API_KEY!,
      api_secret: process.env.CLOUDINARY_API_SECRET!,
      secure: true,
    });
  }
  return cloudinaryInstance;
};
