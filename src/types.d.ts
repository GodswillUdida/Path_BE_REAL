import { AccessPayload } from "./lib/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: AccessPayload;
    }
  }
}

// declare module "cors";
// declare module "compression";
// declare module "morgan";
// declare module "cookie-parser";
// declare module "swagger-ui-express";
// declare module "streamifier";
// declare module "swagger-jsdoc";
// declare module "jsonwebtoken";
// declare module "nodemailer";
