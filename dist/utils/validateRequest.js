"use strict";
// import type { Request, Response, NextFunction, RequestHandler } from "express";
// import { ZodSchema, ZodError } from "zod";
// import { badRequest } from "../utils/errors";
// type Location = "body" | "params" | "query";
// export const validateRequest =
//   (schema: ZodSchema, location: Location = "body"): RequestHandler =>
//   (req: Request, _res: Response, next: NextFunction) => {
//     try {
//       const value =
//         location === "body"
//           ? req.body
//           : location === "params"
//           ? req.params
//           : req.query;
//       const parsed = schema.parse(value);
//       // replace original with parsed (sanitized) values
//       if (location === "body") req.body = parsed;
//       else if (location === "params") req.params = parsed;
//       else req.query = parsed;
//       return next();
//     } catch (err) {
//       if (err instanceof ZodError) {
//         return next(
//           badRequest(
//             "Validation failed: " + err.errors.map((e) => e.message).join(", ")
//           )
//         );
//       }
//       return next(err);
//     }
//   };
