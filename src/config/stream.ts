import cloudinary from "./cloudinary";
import streamifier from "streamifier";

export const streamUpload = (buffer: Buffer, folder:string):Promise<any> => {
  return new Promise<any>(async (resolve, reject) => {
    let stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
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