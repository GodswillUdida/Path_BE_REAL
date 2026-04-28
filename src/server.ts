import "dotenv/config";
import app from "./app";
import prisma from "./lib/prisma";
import logger from "./utils/logger";
import { validateEnv } from "./utils/validateEnv";

// ---------------------------------------------------------------------------
// Environment validation — crash immediately if critical vars are absent.
// Fail loudly at boot rather than silently at runtime.
// ---------------------------------------------------------------------------

validateEnv([
  "PORT",
  "DATABASE_URL",
  "NODE_ENV",
  "FRONTEND_URL",
  "PAYSTACK_SECRET_KEY",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
]);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 5000;
const IS_PROD = process.env.NODE_ENV === "production";

// Render's load balancer idle timeout is ~75s.
// Node's default keepAliveTimeout is 5s — this mismatch causes 502s.
// Set both higher than the load balancer to prevent the race condition.
const KEEP_ALIVE_TIMEOUT_MS = 90_000; // 90s — above Render's 75s
const HEADERS_TIMEOUT_MS = 95_000; // Must be > keepAliveTimeout

// How long to wait for in-flight requests to complete on shutdown
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000;

let server: ReturnType<typeof app.listen> | null = null;

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

const shutdown = async (signal: string): Promise<never> => {
  logger.warn(`[Server] ${signal} received — initiating graceful shutdown`);

  // Stop accepting new connections immediately
  const shutdownTimer = setTimeout(() => {
    logger.error("[Server] Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);

  // Prevent the timer itself from keeping the process alive
  shutdownTimer.unref();

  try {
    // 1. Stop accepting new HTTP requests
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server!.close((err) => (err ? reject(err) : resolve())),
      );
      logger.info("[Server] HTTP server closed — no new connections accepted");
    }

    // 2. Disconnect database (returns connection to pool)
    await prisma.$disconnect();
    logger.info("[Server] Database connection pool released");

    logger.info("[Server] Shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error("[Server] Error during shutdown", err);
    process.exit(1);
  }
};

// ---------------------------------------------------------------------------
// Process-level error handlers
// ---------------------------------------------------------------------------

// Unhandled promise rejections — log and exit.
// Continuing after an unhandled rejection is undefined behavior in Node.js.
process.on("unhandledRejection", (reason: unknown) => {
  logger.error("[Server] Unhandled promise rejection — forcing exit", reason);
  process.exit(1);
});

// Uncaught synchronous exceptions — always fatal
process.on("uncaughtException", (err: Error) => {
  logger.error("[Server] Uncaught exception — forcing exit", err);
  process.exit(1);
});

// Register shutdown signals in ALL environments.
// In dev, this ensures Prisma connections close cleanly on Ctrl+C,
// preventing connection pool exhaustion during active development.
["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => void shutdown(signal));
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

logger.info("[Server] Booting Pathfinder API...");
  
server = app.listen(PORT, "0.0.0.0", () => {
  prisma
    .$connect() 
    .then(() => logger.info("[Server] Database connected"))
  logger.info(`[Server] Listening on port ${PORT} (${process.env.NODE_ENV})`);
});

// Fix the Render 502 race condition:
// keepAliveTimeout must exceed the load balancer's idle timeout (75s on Render)
server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;

// headersTimeout must be strictly greater than keepAliveTimeout
// to prevent a second race condition on slow header parsing
server.headersTimeout = HEADERS_TIMEOUT_MS;

// Apply a global request timeout — any request that doesn't complete
// within this window gets a 408 rather than hanging forever.
// Protects against slow Paystack calls, DB lock waits, etc.
// Note: set this higher than your slowest expected operation (e.g., webhook processing)
server.requestTimeout = 30_000; // 30s — adjust based on your slowest endpoint
