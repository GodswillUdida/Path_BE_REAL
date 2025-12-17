"use strict";
// Example route JSDoc for docs generation (add to routes like program.routes.ts)
/**
 * @swagger
 * /programs/{slug}:
 *   get:
 *     summary: Retrieve a program by slug
 *     tags: [Programs]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: The program slug
 *     responses:
 *       200:
 *         description: The program details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 program:
 *                   type: object
 *                   # Add properties...
 *       404:
 *         description: Program not found
 *     security:
 *       - bearerAuth: []  # If protected
 */
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
const ctrl = __importStar(require("./program.controller"));
const authGuard_1 = require("../../middleware/authGuard");
const roleGuard_1 = require("../../middleware/roleGuard");
const r = (0, express_1.Router)();
r.post("/", authGuard_1.authGuard, (0, roleGuard_1.roleGuard)("admin", "superadmin"), ctrl.createProgramController);
r.get("/", ctrl.listProgramsController);
r.get("/:id", ctrl.getProgramController);
r.get("/:slug", ctrl.getProgramBySlugController);
r.patch("/:id", authGuard_1.authGuard, (0, roleGuard_1.roleGuard)("admin", "superadmin"), ctrl.updateProgramController);
r.delete("/:id", authGuard_1.authGuard, (0, roleGuard_1.roleGuard)("admin", "superadmin"), ctrl.deleteProgramController);
exports.default = r;
