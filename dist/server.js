"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const cluster_1 = __importDefault(require("cluster"));
const os_1 = __importDefault(require("os"));
const app_1 = __importDefault(require("./app"));
const prisma_1 = __importDefault(require("./lib/prisma"));
const logger_1 = __importDefault(require("./utils/logger"));
const validateEnv_1 = require("./utils/validateEnv");
(0, validateEnv_1.validateEnv)(["PORT", "DATABASE_URL", "NODE_ENV"]);
const PORT = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === "production";
const cpuCount = os_1.default.cpus().length;
let server = null;
/* -------------------------------------------------------------------------- */
/*                             GRACEFUL SHUTDOWN                               */
/* -------------------------------------------------------------------------- */
const shutdown = async (signal) => {
    logger_1.default.warn(`🔻 ${signal} received. Shutting down...`);
    try {
        if (server) {
            await new Promise((resolve) => server.close(() => resolve()));
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
process.on("uncaughtException", (err) => {
    logger_1.default.error("Uncaught Exception", err);
    shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
    logger_1.default.error("Unhandled Rejection", reason);
    shutdown("unhandledRejection");
});
/* -------------------------------------------------------------------------- */
/*                                   CLUSTER                                  */
/* -------------------------------------------------------------------------- */
if (cluster_1.default.isPrimary && isProduction) {
    logger_1.default.info(`Primary ${process.pid} running`);
    for (let i = 0; i < cpuCount; i++) {
        cluster_1.default.fork();
    }
    cluster_1.default.on("exit", (worker) => {
        logger_1.default.warn(`Worker ${worker.process.pid} died. Restarting...`);
        cluster_1.default.fork();
    });
    ["SIGINT", "SIGTERM"].forEach((signal) => {
        process.on(signal, () => shutdown(signal));
    });
}
else {
    const start = async () => {
        try {
            await prisma_1.default.$connect();
            logger_1.default.info(`Worker ${process.pid}: DB connected`);
            server = app_1.default.listen(PORT, "0.0.0.0", () => {
                logger_1.default.info(`Worker ${process.pid}: Server running on port ${PORT}`);
            });
        }
        catch (err) {
            logger_1.default.error("Startup failed", err);
            process.exit(1);
        }
    };
    start();
}
