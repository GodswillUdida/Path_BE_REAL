"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rawBodyBuffer = void 0;
// middleware/rawBody.ts
const rawBodyBuffer = (req, res, buf) => {
    if (buf && buf.length) {
        req.rawBody = buf.toString("utf8");
    }
};
exports.rawBodyBuffer = rawBodyBuffer;
