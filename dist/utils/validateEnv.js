"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnv = void 0;
const validateEnv = (required) => {
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error(`🛑 Missing required environment variables: ${missing.join(", ")}`);
        process.exit(1);
    }
};
exports.validateEnv = validateEnv;
