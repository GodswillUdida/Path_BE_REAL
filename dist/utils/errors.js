"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.badRequest = exports.forbidden = exports.unauthorized = exports.notFound = exports.ApiError = void 0;
class ApiError extends Error {
    constructor(message, status = 500, code, details) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.ApiError = ApiError;
const notFound = (msg = "Not Found") => new ApiError(msg, 404, "NOT_FOUND");
exports.notFound = notFound;
const unauthorized = (msg = "Unauthorized") => new ApiError(msg, 401, "UNAUTHORIZED");
exports.unauthorized = unauthorized;
const forbidden = (msg = "Forbidden") => new ApiError(msg, 403, "FORBIDDEN");
exports.forbidden = forbidden;
const badRequest = (msg = "Bad Request") => new ApiError(msg, 400, "BAD_REQUEST");
exports.badRequest = badRequest;
