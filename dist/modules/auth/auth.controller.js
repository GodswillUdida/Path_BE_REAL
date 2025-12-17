"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutController = exports.refreshTokenController = exports.resetPasswordController = exports.forgotPasswordController = exports.verifyEmailController = exports.loginController = exports.registerController = void 0;
const asyncHandler_1 = require("../../utils/asyncHandler");
const auth_schema_1 = require("./auth.schema");
const authService = __importStar(require("./auth.service"));
const logger_1 = __importDefault(require("../../utils/logger"));
const errors_1 = require("../../utils/errors");
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME ?? "refresh_token";
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
};
exports.registerController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const payload = auth_schema_1.registerSchema.parse(req.body);
    const user = await authService.createUser(payload.name, payload.email, payload.password);
    return res.status(201).json({
        success: true,
        message: "Account created. Check your email for a verification link.",
        user,
    });
});
exports.loginController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const payload = auth_schema_1.loginSchema.parse(req.body);
    const result = await authService.authenticate(payload.email, payload.password);
    // set refresh token as httpOnly cookie
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, COOKIE_OPTIONS);
    return res.status(200).json({
        success: true,
        message: "Login Successful",
        ...result,
        // accessToken: result.tokens.accessToken,
        // user: {
        //   id: result.userId,
        //   role: result.role,
        //   name: result.name,
        //   emailVerified: result.emailVerified,
        // },
    });
});
exports.verifyEmailController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { token } = auth_schema_1.verifyEmailSchema.parse(req.body);
    await authService.verifyEmail(token);
    return res.status(200).json({ success: true, message: "Email verified" });
});
exports.forgotPasswordController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { email } = auth_schema_1.forgotPasswordSchema.parse(req.body);
    await authService.requestPasswordReset(email);
    // Always return success to avoid user enumeration
    return res.status(200).json({
        success: true,
        message: "If the email exists we sent reset instructions",
    });
});
exports.resetPasswordController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = auth_schema_1.resetPasswordSchema.parse(req.body);
    await authService.resetPassword(data.token, data.newPassword);
    return res.status(200).json({ success: true, message: "Password updated" });
});
exports.refreshTokenController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const cookie = req.cookies?.[process.env.REFRESH_COOKIE_NAME ?? "refresh_token"];
    if (!cookie)
        throw (0, errors_1.badRequest)("No refresh token provided");
    const rotated = await authService.rotateRefreshToken(cookie);
    // set new refresh cookie
    res.cookie(REFRESH_COOKIE_NAME, rotated.refreshToken, COOKIE_OPTIONS);
    res.status(200).json({ success: true, accessToken: rotated.accessToken });
});
exports.logoutController = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    try {
        const cookie = req.cookies?.[process.env.REFRESH_COOKIE_NAME ?? "refresh_token"];
        if (cookie) {
            const { verifyRefreshToken } = await Promise.resolve().then(() => __importStar(require("../../lib/jwt")));
            const payload = verifyRefreshToken(cookie);
            if (payload?.userId) {
                await authService.logout(payload.userId);
            }
        }
    }
    catch (err) {
        logger_1.default.warn("Logout: refresh token invalid", {
            error: err.message,
        });
    }
    finally {
        res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
        res.status(200).json({ success: true, message: "Logged out" });
    }
});
