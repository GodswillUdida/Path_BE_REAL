"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.AppError = void 0;
const logger_1 = __importDefault(require("../utils/logger")); // Assuming this is a configured logger like Winston or Pino for structured logging
// Enhanced custom error class
// - Extends Error for standard behavior
// - Adds statusCode, operational flag (to distinguish trusted errors from bugs)
// - Captures stack trace properly, excluding constructor
// - Optional data field for additional context (e.g., validation errors)
class AppError extends Error {
    constructor(message, statusCode = 500, data) {
        super(message);
        this.isOperational = true; // Marks as operational error (not a programming bug)
        this.statusCode = statusCode;
        this.data = data;
        // Capture stack trace, excluding the constructor invocation for cleaner stacks
        Error.captureStackTrace(this, this.constructor);
        // For security: In production, we can override toString or handle logging to avoid leaking sensitive info
    }
}
exports.AppError = AppError;
// Global error handler middleware
// - Handles both operational (AppError) and programming errors
// - Structured logging for scalability (easy querying in log aggregators like ELK or Splunk)
// - Environment-aware: In dev, include stack/details; in prod, hide sensitive info for security
// - Performance: Async logging if logger supports it; minimal processing
// - Security: Never expose stack traces or internal details to clients in production
// - Handles common Express errors like SyntaxError (invalid JSON body)
// - Consistent response format: { success: false, error: string, data?: any }
const errorHandler = (err, // Use unknown for safety in TS; we'll type-check inside
req, res, next) => {
    // Default to internal server error
    let statusCode = 500;
    let message = "Internal server error";
    let data = undefined;
    // Determine environment (use process.env.NODE_ENV or a config service for better practice)
    const isProduction = process.env.NODE_ENV === "production";
    // Type-check err
    if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
        data = err.data;
    }
    else if (err instanceof SyntaxError &&
        err.body &&
        /Unexpected token/.test(err.message)) {
        // Handle common JSON parse errors from body-parser
        statusCode = 400;
        message = "Invalid JSON payload";
    }
    else if (err instanceof Error) {
        // Generic Error: Treat as programming error (not operational)
        message = isProduction ? "Internal server error" : err.message;
    }
    else {
        // Non-Error thrown (e.g., string or object)
        message = isProduction ? "Internal server error" : String(err);
    }
    // Structured logging: Include request context for traceability
    // - Use logger with levels; error for severe, warn for operational
    // - Add metadata: userId if auth, IP, etc., for security auditing
    const logLevel = statusCode >= 500 ? "error" : "warn";
    const logMeta = {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        // userId: req.user?.id, // Uncomment if using auth middleware
        stack: isProduction
            ? undefined
            : err instanceof Error
                ? err.stack
                : undefined,
    };
    logger_1.default[logLevel](`${message} - ${req.method} ${req.url}`, logMeta);
    // Send response: Consistent format, no stack in prod
    res.status(statusCode).json({
        success: false,
        error: message,
        ...(data && { data }), // Include data only if present (e.g., validation details)
        ...(!isProduction && {
            stack: err instanceof Error ? err.stack : undefined,
        }), // Dev-only
    });
    // No need for next() as this is the final handler
};
exports.errorHandler = errorHandler;
