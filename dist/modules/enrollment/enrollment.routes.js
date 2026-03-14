"use strict";
// enrollment.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const enrollment_controller_1 = require("./enrollment.controller");
const authGuard_1 = require("../../middleware/authGuard");
const router = (0, express_1.Router)();
router.get("/enrollments", authGuard_1.authGuard, enrollment_controller_1.getMyEnrollments);
router.get("/enrollments/:id", authGuard_1.authGuard, enrollment_controller_1.getOneEnrollment);
exports.default = router;
