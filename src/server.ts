/**
 * @file server.ts
 * @description Process entry point and lifecycle orchestrator for Pathfinder.
 *
 * Supports:
 * - API process
 * - Background worker process
 *
 * Responsibilities:
 * - Validate runtime configuration
 * - Establish shared infrastructure
 * - Start HTTP API or worker runtime
 * - Handle graceful shutdown
 * - Drain network traffic
 * - Stop workers
 * - Close queue/Redis connections
 * - Disconnect Prisma
 */

import "dotenv/config";

import { promisify } from "node:util";

import prisma from "./lib/prisma";
import logger from "./utils/logger";
import { validateEnv } from "./utils/validateEnv";
import { closeAllQueues } from "./lib/queues/create-queue";
import { shutdownWorkers } from "./lib/queues/create-worker";
import { markShuttingDown } from "./lib/lifecycle";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type ProcessType = "api" | "worker";

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

validateEnv([
  "PORT",
  "DATABASE_URL",
  "NODE_ENV",
  "FRONTEND_URL",
  "PAYSTACK_SECRET_KEY",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "BUNNY_STREAM_API_KEY",
  "BUNNY_STREAM_LIBRARY_ID",
  "BUNNY_STREAM_SIGNING_KEY",
  "QUEUE_BOARD_USER",
  "QUEUE_BOARD_PASSWORD",
  "QUEUE_BOARD_PORT",
  "UPLOAD_TMP_DIR",
]);

function parsePositiveInt(
  value: string | undefined,
  name: string,
): number {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function parseProcessType(value: string | undefined): ProcessType {
  const processType = value ?? "api";

  if (processType !== "api" && processType !== "worker") {
    throw new Error(
      `Invalid PROCESS_TYPE "${processType}". Expected "api" or "worker".`,
    );
  }

  return processType;
}

const PORT = parsePositiveInt(process.env.PORT, "PORT");

const PROCESS_TYPE = parseProcessType(
  process.env.PROCESS_TYPE,
);

const HTTP_KEEP_ALIVE_TIMEOUT_MS = parsePositiveInt(
  process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS ?? "55000",
  "HTTP_KEEP_ALIVE_TIMEOUT_MS",
);

const HTTP_HEADERS_TIMEOUT_MS = parsePositiveInt(
  process.env.HTTP_HEADERS_TIMEOUT_MS ?? "60000",
  "HTTP_HEADERS_TIMEOUT_MS",
);

const HTTP_REQUEST_TIMEOUT_MS = parsePositiveInt(
  process.env.HTTP_REQUEST_TIMEOUT_MS ?? "300000",
  "HTTP_REQUEST_TIMEOUT_MS",
);

const SHUTDOWN_TIMEOUT_MS = parsePositiveInt(
  process.env.SHUTDOWN_TIMEOUT_MS ??
    (PROCESS_TYPE === "worker" ? "60000" : "20000"),
  "SHUTDOWN_TIMEOUT_MS",
);

// -----------------------------------------------------------------------------
// Runtime state
// -----------------------------------------------------------------------------

let server: ReturnType<(typeof import("node:http"))["createServer"]> | null =
  null;

let shutdownPromise: Promise<void> | null = null;

// -----------------------------------------------------------------------------
// Error serialization
// -----------------------------------------------------------------------------

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

// -----------------------------------------------------------------------------
// HTTP shutdown helper
// -----------------------------------------------------------------------------

async function closeHttpServer(): Promise<void> {
  if (!server || !server.listening) {
    return;
  }

  const httpServer = server;

  logger.info("[Server] Stopping HTTP listener...");

  const closePromise = promisify(httpServer.close.bind(httpServer))();

  // Node >= 19 handles idle keep-alive connections during close().
  // Calling this explicitly remains useful for compatibility.
  httpServer.closeIdleConnections();

  await closePromise;

  logger.info("[Server] HTTP server closed.");
}

// -----------------------------------------------------------------------------
// Shutdown orchestration
// -----------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) {
    logger.warn(
      `[Server] ${signal} received while shutdown is already running.`,
    );

    return shutdownPromise;
  }

  shutdownPromise = performShutdown(signal);

  return shutdownPromise;
}

async function performShutdown(signal: string): Promise<void> {
  markShuttingDown();

  logger.warn(
    `[Server] ${signal} received. Beginning graceful shutdown.`,
  );

  const shutdownTimer = setTimeout(() => {
    logger.error(
      `[Server] Graceful shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms. Forcing termination.`,
    );

    if (server?.listening) {
      server.closeAllConnections();
    }

    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  shutdownTimer.unref();

  let shutdownFailed = false;

  try {
    // -------------------------------------------------------------------------
    // Phase 1 — Stop accepting new HTTP traffic
    // -------------------------------------------------------------------------

    try {
      await closeHttpServer();
    } catch (error) {
      shutdownFailed = true;

      logger.error(
        "[Server] Failed to close HTTP server cleanly.",
        serializeError(error),
      );
    }

    // -------------------------------------------------------------------------
    // Phase 2 — Stop background job consumption
    // -------------------------------------------------------------------------

    if (PROCESS_TYPE === "worker") {
      try {
        logger.info("[Server] Stopping background workers...");

        await shutdownWorkers();

        logger.info("[Server] Background workers stopped.");
      } catch (error) {
        shutdownFailed = true;

        logger.error(
          "[Server] Failed to stop workers cleanly.",
          serializeError(error),
        );
      }
    }

    // -------------------------------------------------------------------------
    // Phase 3 — Close queue / Redis connections
    // -------------------------------------------------------------------------

    try {
      logger.info("[Server] Closing queue connections...");

      await closeAllQueues();

      logger.info("[Server] Queue connections closed.");
    } catch (error) {
      shutdownFailed = true;

      logger.error(
        "[Server] Failed to close queue connections cleanly.",
        serializeError(error),
      );
    }

    // -------------------------------------------------------------------------
    // Phase 4 — Disconnect database
    // -------------------------------------------------------------------------

    try {
      logger.info("[Server] Disconnecting Prisma...");

      await prisma.$disconnect();

      logger.info("[Server] Prisma disconnected.");
    } catch (error) {
      shutdownFailed = true;

      logger.error(
        "[Server] Failed to disconnect Prisma cleanly.",
        serializeError(error),
      );
    }
  } finally {
    clearTimeout(shutdownTimer);

    logger.info(
      `[Server] Shutdown sequence completed for process type: ${PROCESS_TYPE}.`,
    );

    process.exit(shutdownFailed ? 1 : 0);
  }
}

// -----------------------------------------------------------------------------
// Fatal process-level failures
// -----------------------------------------------------------------------------

process.on(
  "unhandledRejection",
  (reason: unknown) => {
    logger.error(
      "[Server] Unhandled promise rejection.",
      serializeError(reason),
    );

    void shutdown("UNHANDLED_REJECTION");
  },
);

process.on(
  "uncaughtException",
  (error: Error) => {
    logger.error(
      "[Server] Uncaught exception. Process cannot safely continue.",
      serializeError(error),
    );

    void shutdown("UNCAUGHT_EXCEPTION");
  },
);

// -----------------------------------------------------------------------------
// Operating-system signals
// -----------------------------------------------------------------------------

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

// -----------------------------------------------------------------------------
// API bootstrap
// -----------------------------------------------------------------------------

async function startApi(): Promise<void> {
  const { default: app } = await import("./app");
  const { createServer } = await import("node:http");

  server = createServer(app);

  server.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HTTP_HEADERS_TIMEOUT_MS;
  server.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;

  if ("keepAliveTimeoutBuffer" in server) {
    server.keepAliveTimeoutBuffer = 1000;
  }

  await new Promise<void>((resolve, reject) => {
    const httpServer = server!;

    const onError = (error: NodeJS.ErrnoException) => {
      httpServer.off("listening", onListening);

      if (error.code === "EADDRINUSE") {
        logger.error(
          `[Server] Port ${PORT} is already in use.`,
          serializeError(error),
        );
      } else {
        logger.error(
          "[Server] HTTP server failed to start.",
          serializeError(error),
        );
      }

      reject(error);
    };

    const onListening = () => {
      httpServer.off("error", onError);

      logger.info(
        `[Server] API process listening on port ${PORT} (${process.env.NODE_ENV}).`,
      );

      resolve();
    };

    httpServer.once("error", onError);
    httpServer.once("listening", onListening);

    httpServer.listen(PORT, "0.0.0.0");
  });
}

// -----------------------------------------------------------------------------
// Worker bootstrap
// -----------------------------------------------------------------------------

async function startWorker(): Promise<void> {
  logger.info(
    "[Server] Initializing background worker runtime...",
  );

  await import("./workers/index");

  logger.info(
    "[Server] Background worker runtime is active.",
  );
}

// -----------------------------------------------------------------------------
// Application bootstrap
// -----------------------------------------------------------------------------

async function start(): Promise<void> {
  logger.info(
    `[Server] Booting Pathfinder process: ${PROCESS_TYPE}`,
  );

  // Prisma connects lazily, but explicit startup connection allows
  // infrastructure failures to be detected before accepting work.
  await prisma.$connect();

  logger.info(
    "[Server] Database connection established.",
  );

  if (PROCESS_TYPE === "worker") {
    await startWorker();
    return;
  }

  await startApi();
}

// -----------------------------------------------------------------------------
// Fatal startup failure
// -----------------------------------------------------------------------------

start().catch(async (error) => {
  logger.error(
    "[Server] Fatal startup failure.",
    serializeError(error),
  );

  try {
    await prisma.$disconnect();
  } catch (disconnectError) {
    logger.error(
      "[Server] Failed to disconnect Prisma after startup failure.",
      serializeError(disconnectError),
    );
  }

  process.exit(1);
});