import "dotenv/config";
import app from "./app";
import prisma from "./lib/prisma";
import logger from "./utils/logger";
import { validateEnv } from "./utils/validateEnv";

validateEnv(["PORT", "DATABASE_URL", "NODE_ENV"]);

const PORT = Number(process.env.PORT) || 5000;
let server: ReturnType<typeof app.listen> | null = null;

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

if (process.env.NODE_ENV === "production") {
  ["SIGINT", "SIGTERM"].forEach((signal) => {
    process.on(signal, shutdown);
  });
}

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception", err);
  process.exit(1);
});

logger.info("🚀 Booting Pathfinder API...");

server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`✅ Server running on port ${PORT}`);
});
