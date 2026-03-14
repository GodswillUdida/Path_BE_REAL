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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController = __importStar(require("./auth.controller"));
const authGuard_1 = require("../../middleware/authGuard");
const roleGuard_1 = require("../../middleware/roleGuard");
const r = (0, express_1.Router)();
r.post("/guest-login", authController.guestLoginController);
r.post("/register", authController.registerController);
r.post("/login", authController.loginController);
r.post("/verify-email", authController.verifyEmailController);
r.post("/forgot-password", authController.forgotPasswordController);
r.post("/reset-password", authController.resetPasswordController);
r.post("/refresh", authController.refreshTokenController);
// Authenticated
r.post("/logout", authGuard_1.authGuard, authController.logoutController);
r.get("/sessions", authGuard_1.authGuard, authController.getSessionsController);
r.delete("/sessions/:id", authGuard_1.authGuard, authController.revokeSessionController);
r.post("/logout-all", authGuard_1.authGuard, authController.logoutAllController);
// Protected test route with role
r.get("/me", authGuard_1.authGuard, authController.getUserByIdController);
r.get("/users", authGuard_1.authGuard, (0, roleGuard_1.roleGuard)("admin", "superadmin"), authController.getAllUsersController);
// r.get( "/user/:id", authGuard, roleGuard("admin", "superadmin"), authController.getUserByIdController,);
exports.default = r;
