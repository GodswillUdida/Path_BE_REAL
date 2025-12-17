"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleGuard = void 0;
const errors_1 = require("../utils/errors");
const roleGuard = (...allowedRoles) => {
    return (req, _res, next) => {
        if (!req.user)
            throw (0, errors_1.forbidden)("Not authenticated");
        if (!allowedRoles.includes(req.user.role))
            throw (0, errors_1.forbidden)("Insufficient permissions");
        next();
    };
};
exports.roleGuard = roleGuard;
