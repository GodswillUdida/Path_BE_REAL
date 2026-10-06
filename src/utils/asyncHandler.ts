import type { Request, Response, NextFunction, RequestHandler } from "express";

export const asyncHandler = (fn: RequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const ret = fn(req, res, next);
      if (ret && ret instanceof Promise) {
        ret.catch(next);
      }
      return ret;
    } catch (err) {
      next(err);
    }
  };
};


/* -------------------- ASYNC WRAPPER -------------------- */
// const asyncHandler =
//   (fn: any) => (req: Request, res: Response, next: NextFunction) =>
//     Promise.resolve(fn(req, res, next)).catch(next);