// import { MulterFiles } from "@/types/express";

// export function extractCourseMedia(req: Request) {
//   let files: MulterFiles = {};

//   if (req.files && !Array.isArray(req.files)) {
//     files = req.files as MulterFiles;
//   }

//   return {
//     thumbnailFile: files.thumbnail?.[0],
//     videoFile: files.videoPreview?.[0],
//   };
// }