// // types/file.types.ts
// import { Request } from "express";

// // Extend Multer's File type if needed
// declare global {
//   namespace Express {
//     interface Multer {
//       File: Express.Multer.File;
//     }
//   }
// }

// export interface CourseFiles {
//   thumbnail?: Express.Multer.File[];
//   videoPreview?: Express.Multer.File[];
// }

// export interface CourseRequest extends Request {
//   files?: CourseFiles | { [fieldname: string]: Express.Multer.File[] };
// }