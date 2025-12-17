"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareTokenHash = exports.hashToken = void 0;
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
exports.hashRefreshToken = hashRefreshToken;
const bcryptjs_1 = require("bcryptjs");
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
async function hashPassword(password) {
    return await (0, bcryptjs_1.hash)(password, SALT_ROUNDS);
}
async function comparePassword(password, hashedPassword) {
    return await (0, bcryptjs_1.compare)(password, hashedPassword);
}
const hashToken = async (token) => {
    return (0, bcryptjs_1.hash)(token, SALT_ROUNDS);
    // return crypto.createHash("sha256").update(token).digest("hex");
};
exports.hashToken = hashToken;
const compareTokenHash = async (token, hash) => {
    return (0, bcryptjs_1.compare)(token, hash);
    // hashToken(token) === hashed;
};
exports.compareTokenHash = compareTokenHash;
// refresh token
async function hashRefreshToken(token) {
    const saltRounds = 10;
    return await (0, bcryptjs_1.hash)(token, saltRounds);
}
