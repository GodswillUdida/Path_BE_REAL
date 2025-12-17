"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// import cluster from "cluster";
// import os from "os";
const app_1 = __importDefault(require("./app"));
const prisma_1 = __importDefault(require("./lib/prisma"));
const logger_1 = __importDefault(require("./utils/logger"));
const validateEnv_1 = require("./utils/validateEnv");
(0, validateEnv_1.validateEnv)(["PORT", "DATABASE_URL", "NODE_ENV"]);
const PORT = Number(process.env.PORT || 5000);
// const isProduction = process.env.NODE_ENV === "production";
// const cpuCount = os.cpus().length;
// let server: ReturnType<typeof app.listen> | null = null;
/* -------------------------------------------------------------------------- */
/*                             GRACEFUL SHUTDOWN                               */
/* -------------------------------------------------------------------------- */
const shutdown = async (signal) => {
    logger_1.default.warn(`🔻 ${signal} received. Shutting down...`);
    try {
        // if (server) {
        //   await new Promise<void>((resolve) => server!.close(() => resolve()));
        // }
        await prisma_1.default.$disconnect();
        logger_1.default.info("Database disconnected");
        process.exit(0);
    }
    catch (err) {
        logger_1.default.error("Shutdown failed", err);
        process.exit(1);
    }
};
// process.on("uncaughtException", (err) => {
//   logger.error("Uncaught Exception", err);
//   shutdown("uncaughtException");
// });
// process.on("unhandledRejection", (reason) => {
//   logger.error("Unhandled Rejection", reason);
//   shutdown("unhandledRejection");
// });
process.on("uncaughtException", (err) => shutdown("uncaughtException"));
process.on("unhandledRejection", (reason) => shutdown("unhandledRejection"));
["SIGINT", "SIGTERM"].forEach((sig) => process.on(sig, () => shutdown(sig)));
/* -------------------------------------------------------------------------- */
/*                                   CLUSTER                                  */
/* -------------------------------------------------------------------------- */
// if (cluster.isPrimary && !isProduction) {
//   logger.info(`Primary ${process.pid} running`);
//   for (let i = 0; i < cpuCount; i++) {
//     cluster.fork();
//   }
//   cluster.on("exit", (worker) => {
//     logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
//     cluster.fork();
//   });
//   ["SIGINT", "SIGTERM"].forEach((signal) => {
//     process.on(signal, () => shutdown(signal));
//   });
// } else {
const start = async () => {
    try {
        await prisma_1.default.$connect();
        logger_1.default.info(`DB connected`);
        app_1.default.listen(PORT, "0.0.0.0", () => {
            logger_1.default.info(`Server running on port ${PORT}`);
        });
    }
    catch (err) {
        logger_1.default.error("Startup failed", err);
        process.exit(1);
    }
};
start();
// }
