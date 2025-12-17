"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorResponse = exports.successResponse = void 0;
const successResponse = (res, data, message = "Success", statusCode = 200) => {
    return res.status(statusCode).json({
        status: "success",
        message,
        data,
    });
};
exports.successResponse = successResponse;
const errorResponse = (res, message = "Something went wrong", statusCode = 500, errors) => {
    return res.status(statusCode).json({
        status: "error",
        message,
        errors: errors ?? null,
    });
};
exports.errorResponse = errorResponse;
