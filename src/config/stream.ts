import streamifier from "streamifier";
import { getCloudinary } from "./cloudinary";

export const streamUpload = (buffer: Buffer, folder:string):Promise<any> => {
  return new Promise<any>(async (resolve, reject) => {
    const cloudinary = await getCloudinary();
    let stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        transformation: [{ quality: "auto", fetch_format: "auto" }],
      },
      (error: any, result: any) => {
        if (result) {
          return resolve(result);
        } else {
          return reject(error);
        }
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};