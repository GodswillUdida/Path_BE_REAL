import { AccessPayload } from "./lib/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: AccessPayload;
    }
  }
};