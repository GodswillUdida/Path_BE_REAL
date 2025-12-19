import dotenv from "dotenv";
dotenv.config();
import app from "./app";
import prisma from "./lib/prisma";
import logger from "./utils/logger";
import { validateEnv } from "./utils/validateEnv";

validateEnv(["PORT", "DATABASE_URL", "NODE_ENV"]);

const PORT = Number(process.env.PORT) || 5000;

let server: ReturnType<typeof app.listen> | null = null;

/* -------------------------------------------------------------------------- */
/*                             GRACEFUL SHUTDOWN                               */
/* -------------------------------------------------------------------------- */

const shutdown = async (signal: string) => {
  logger.warn(`🔻 ${signal} received. Shutting down...`);

  try {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      logger.info("HTTP server closed");
    }

    await prisma.$disconnect();
    logger.info("Database disconnected");

    process.exit(0);
  } catch (err) {
    logger.error("Shutdown failed", err);
    process.exit(1);
  }
};

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, shutdown);
});

process.on("unhandledRejection", (err) => {
  logger.error("Uncaught Exception", err);
  shutdown("uncaughtException");
});

process.on("uncaughtException", (err) => {
  logger.error("Unhandled Rejection", err);
  shutdown("unhandledRejection");
});

const start = async () => {
  try {
    logger.info(`Server Starting ...`);

    server = app.listen(PORT, "0.0.0.0", () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error("Startup failed", err);
    process.exit(1);
  }
};

start();
