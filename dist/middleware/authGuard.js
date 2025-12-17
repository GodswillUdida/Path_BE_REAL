"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authGuard = authGuard;
const errors_1 = require("../utils/errors");
const jwt_1 = require("../lib/jwt");
const logger_1 = __importDefault(require("../utils/logger"));
function authGuard(req, _res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer "))
        throw (0, errors_1.unauthorized)("Missing or invalid Authorization header");
    const token = header.split(" ")[1];
    try {
        const payload = (0, jwt_1.verifyAccessToken)(token);
        req.user = {
            id: payload.userId,
            role: payload.role,
        };
        next();
    }
    catch (error) {
        logger_1.default.error("Invalid or expired access token", error);
        throw (0, errors_1.unauthorized)("Invalid or expired access token");
    }
}
