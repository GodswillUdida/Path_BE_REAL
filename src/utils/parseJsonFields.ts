// import { badRequest } from "./errors";

// interface RequestWithBody {
//   body: Record<string, unknown>;
// }

// interface NextFunction {
//   (error?: unknown): void;
// }

// export const parseJsonFields = (fields: string[]) => (
//   req: RequestWithBody,
//   _res: unknown,
//   next: NextFunction,
// ) => {
//   for (const field of fields) {
//     if (typeof req.body[field] === "string") {
//       try {
//         req.body[field] = JSON.parse(req.body[field]);
//       } catch {
//         return next(badRequest(`${field} must be valid JSON`));
//       }
//     }
//   }
//   next();
// };

// src/middleware/parseJsonFields.ts
// src/middleware/parseJsonFields.ts
import { Request, Response, NextFunction } from "express";

export const parseJsonFields = (fields: string[] = []) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      for (const field of fields) {
        const value = req.body[field];

        if (typeof value === "string") {
          try {
            req.body[field] = JSON.parse(value);
          } catch (err) {
            console.warn(`Failed to parse ${field}:`, value);
            req.body[field] = field === "pricings" ? [] : field === "tags" ? [] : null;
          }
        } else if (value === undefined) {
          req.body[field] = field === "pricings" ? [] : field === "tags" ? [] : undefined;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};