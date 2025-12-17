"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.verifyRefreshToken = exports.signRefreshToken = exports.verifyAccessToken = exports.signAccessToken = void 0;
const jsonwebtoken_1 = require("jsonwebtoken");
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!ACCESS_SECRET || !REFRESH_SECRET) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be configured");
}
const signAccessToken = (payload) => {
    return (0, jsonwebtoken_1.sign)(payload, ACCESS_SECRET, {
        expiresIn: "60m",
    });
};
exports.signAccessToken = signAccessToken;
const verifyAccessToken = (token) => {
    return (0, jsonwebtoken_1.verify)(token, ACCESS_SECRET);
};
exports.verifyAccessToken = verifyAccessToken;
const signRefreshToken = (payload) => {
    return (0, jsonwebtoken_1.sign)(payload, REFRESH_SECRET, {
        expiresIn: "7d",
    });
};
exports.signRefreshToken = signRefreshToken;
const verifyRefreshToken = (token) => {
    return (0, jsonwebtoken_1.verify)(token, REFRESH_SECRET);
};
exports.verifyRefreshToken = verifyRefreshToken;
const verifyToken = (token, secret) => {
    return (0, jsonwebtoken_1.verify)(token, secret);
};
exports.verifyToken = verifyToken;
