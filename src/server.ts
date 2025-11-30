import env from "dotenv";
import { PrismaClient } from "@prisma/client";
import app from "./app";
import { validateEnv } from "./utils/validateEnv";
import logger from "./utils/logger";
import prisma from "./lib/prisma";

env.config();

validateEnv(["PORT", "DATABASE_URL"]);

const PORT = Number(process.env.PORT ?? 5000);

let server: ReturnType<typeof app.listen> | null = null;

const startServer = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info("Database connected");

    server = app.listen(PORT, "0.0.0.0", () => {
      logger.info(`Server running on http://localhost:${PORT}`);
    });

    server.on("error", (err) => {
      logger.error("HTTP server error", { error: err });
    });

    server.on("close", () => {
      logger.info("HTTP server closed");
    });

    const gracefulShutdown = async (): Promise<void> => {
      logger.warn("🔻 Shutting down server...");

      try {
        if (server) {
          await new Promise<void>((resolve, reject) => {
            server?.close((err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }

        await prisma.$disconnect();
        logger.info("Database disconnected");
        process.exit(0);
      } catch (err) {
        logger.error("🛑 Shutdown error", { error: err });
        process.exit(1);
      }
    };

    process.once("SIGINT", gracefulShutdown);
    process.once("SIGTERM", gracefulShutdown);

    process.on("uncaughtException", async (err) => {
      logger.error("Uncaught Exception", { error: err });
      await gracefulShutdown();
    });

    process.on("unhandledRejection", async (reason) => {
      logger.error("Unhandled Rejection", { error: reason });
      await gracefulShutdown();
    });
  } catch (err: any) {
    logger.error("🛑 Server startup failed", { error: err.message });
    process.exit(1);
  }
};

startServer();
