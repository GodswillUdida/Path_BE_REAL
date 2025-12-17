import dotenv from "dotenv";
dotenv.config();

// import cluster from "cluster";
// import os from "os";
import app from "./app";
import prisma from "./lib/prisma";
import logger from "./utils/logger";
import { validateEnv } from "./utils/validateEnv";

validateEnv(["PORT", "DATABASE_URL", "NODE_ENV"]);

const PORT = Number(process.env.PORT || 5000);
// const isProduction = process.env.NODE_ENV === "production";
// const cpuCount = os.cpus().length;

// let server: ReturnType<typeof app.listen> | null = null;

/* -------------------------------------------------------------------------- */
/*                             GRACEFUL SHUTDOWN                               */
/* -------------------------------------------------------------------------- */

const shutdown = async (signal: string) => {
  logger.warn(`🔻 ${signal} received. Shutting down...`);

  try {
    // if (server) {
    //   await new Promise<void>((resolve) => server!.close(() => resolve()));
    // }

    await prisma.$disconnect();
    logger.info("Database disconnected");
    process.exit(0);
  } catch (err) {
    logger.error("Shutdown failed", err);
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
    await prisma.$connect();
    logger.info(`DB connected`);

    app.listen(PORT, "0.0.0.0", () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error("Startup failed", err);
    process.exit(1);
  }
};

start();
// }
