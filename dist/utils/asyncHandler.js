"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = void 0;
const asyncHandler = (fn) => {
    return (req, res, next) => {
        try {
            const ret = fn(req, res, next);
            if (ret && ret instanceof Promise) {
                ret.catch(next);
            }
            return ret;
        }
        catch (err) {
            next(err);
        }
    };
};
exports.asyncHandler = asyncHandler;
