"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app_1 = __importDefault(require("./app"));
const prisma_1 = __importDefault(require("./lib/prisma"));
const logger_1 = __importDefault(require("./utils/logger"));
const validateEnv_1 = require("./utils/validateEnv");
(0, validateEnv_1.validateEnv)(["PORT", "DATABASE_URL", "NODE_ENV"]);
const PORT = Number(process.env.PORT) || 5000;
let server = null;
/* -------------------------------------------------------------------------- */
/*                             GRACEFUL SHUTDOWN                               */
/* -------------------------------------------------------------------------- */
const shutdown = async (signal) => {
    logger_1.default.warn(`🔻 ${signal} received. Shutting down...`);
    try {
        if (server) {
            await new Promise((resolve) => server.close(() => resolve()));
            logger_1.default.info("HTTP server closed");
        }
        await prisma_1.default.$disconnect();
        logger_1.default.info("Database disconnected");
        process.exit(0);
    }
    catch (err) {
        logger_1.default.error("Shutdown failed", err);
        process.exit(1);
    }
};
["SIGINT", "SIGTERM"].forEach((signal) => {
    process.on(signal, shutdown);
});
process.on("unhandledRejection", (err) => {
    logger_1.default.error("Uncaught Exception", err);
    shutdown("uncaughtException");
});
process.on("uncaughtException", (err) => {
    logger_1.default.error("Unhandled Rejection", err);
    shutdown("unhandledRejection");
});
const start = async () => {
    try {
        logger_1.default.info(`Server Starting ...`);
        server = app_1.default.listen(PORT, "0.0.0.0", () => {
            logger_1.default.info(`Server running on port ${PORT}`);
        });
    }
    catch (err) {
        logger_1.default.error("Startup failed", err);
        process.exit(1);
    }
};
start();
