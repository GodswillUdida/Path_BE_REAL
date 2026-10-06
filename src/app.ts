/**
 * @file app.ts
 * @description 2026 Enterprise Express Infrastructure Engine.
 * Configured with rigid stream routing safeguards for secure third-party webhook verification.
 */

import express, { Application, json } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { join } from "path";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import { corsOptions } from "./middleware/cors";
import { errorHandler } from "./middleware/error";
import logger from "./utils/logger";

// Route Module Imports
import authRoutes from "./modules/auth/auth.routes";
import courseRoutes from "./modules/course/course.routes";
import programRoutes from "./modules/program/program.routes";
import moduleRoutes from "./modules/module/module.routes";
import topicRoutes from "./modules/topic/topic.routes";
import enrollmentRoutes from "./modules/enrollment/enrollment.routes";
import orderRoutes from "./modules/order/order.routes";
import paymentRoutes from "./modules/payment/payment.routes";
import progresessRoutes from "./modules/progress/progress.routes";
import certificateRoutes from "./modules/certificate/certificate.routes";
import intakeRoutes from "./modules/intake/intake.routes";
import { bunnyWebhookController } from "./modules/topic/topic.controller";
import { redisHealthCheck } from "./lib/queues/redis-health";

const app: Application = express();
const isProduction = process.env.NODE_ENV === "production";
const BODY_LIMIT = "1mb";
const API_PREFIX = "/api/v1";
const COOKIE_SECRET = process.env.COOKIE_SECRET || "default_cookie_secret_change_me_in_production";

/* -------------------------------------------------------------------------- */
/*  PROXY TRUST — Crucial for secure cookie transport via reverse proxies      */
/* -------------------------------------------------------------------------- */
app.set("trust proxy", 1);

/* -------------------------------------------------------------------------- */
/*                               SECURITY LAYER                               */
/* -------------------------------------------------------------------------- */
app.use(cors(corsOptions));
app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }));
app.use(cookieParser(COOKIE_SECRET));

/* -------------------------------------------------------------------------- */
/*                             GLOBAL RATE LIMITER                            */
/* -------------------------------------------------------------------------- */
if (isProduction) {
  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 Minute window
      max: 300,                 // Uped from 100 to prevent false-positives under heavy SPA hydration
      standardHeaders: true,
      legacyHeaders: false,
      message: { status: 429, error: "Too many requests, please slow down your request rate." }
    }),
  );
}

/* -------------------------------------------------------------------------- */
/*                 WEBHOOK CHANNELS (CRITICAL: RAW BODY ROUTING)               */
/*   These must sit BEFORE json() body-parsers modify incoming data streams   */
/* -------------------------------------------------------------------------- */

// 1. Paystack Webhook Configuration
app.use(
  `${API_PREFIX}/payments/paystack/webhook`,
  express.raw({ type: "application/json", limit: BODY_LIMIT }),
);

// 2. Bunny Stream Webhook Configuration
// Fixed: Provisioned as raw stream before global json() consumes the buffer
app.use(
  `${API_PREFIX}/webhooks/bunny`,
  express.raw({ type: "application/json", limit: BODY_LIMIT }),
);

/* -------------------------------------------------------------------------- */
/*                             STANDARD BODY PARSERS                          */
/* -------------------------------------------------------------------------- */
app.use(json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use(compression());

/* -------------------------------------------------------------------------- */
/*                             HTTP TELEMETRY LOGS                            */
/* -------------------------------------------------------------------------- */
app.use(
  morgan(isProduction ? "combined" : "dev", {
    stream: isProduction ? { write: (msg) => logger.info(msg.trim()) } : undefined,
  }),
);

/* -------------------------------------------------------------------------- */
/*                               TEMPLATE ENGINE                              */
/* -------------------------------------------------------------------------- */
app.set("views", join(__dirname, "views"));
app.set("view engine", "ejs");

/* -------------------------------------------------------------------------- */
/*                             INFRASTRUCTURE HEALTH SITES                    */
/* -------------------------------------------------------------------------- */

app.get("/health", async (_req, res) => {
  try {
    const { default: prisma } = await import("./lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "healthy",
      service: "Pathfinder API",
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ status: "unhealthy" });
  }
});

app.get("/health/ready", async (_req, res) => {
  try {
    // 2026 Strategy Standard: Interfacing directly with your core connection factory
      await redisHealthCheck(); // Using the dedicated health check function
    
    res.status(200).json({ status: "healthy", redis: "connected" });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", redis: "disconnected" });
  }
});

app.get("/", async (_req, res) => {
  res.status(200).json({
    status: true,
    message: "Welcome to Accountant Pathfinder API ✔🚀, Explore 🌍",
    data: { service: "pathfinder-api", version: "1.0" },
  });
});

/* -------------------------------------------------------------------------- */
/*                               API ENDPOINT ROUTING                         */
/* -------------------------------------------------------------------------- */

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/programs`, programRoutes);
app.use(`${API_PREFIX}/courses`, courseRoutes);
app.use(`${API_PREFIX}/modules`, moduleRoutes);
app.use(`${API_PREFIX}/topics`, topicRoutes);
app.use(`${API_PREFIX}/enrollments`, enrollmentRoutes);
app.use(`${API_PREFIX}/orders`, orderRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/progress`, progresessRoutes);
app.use(`${API_PREFIX}/certificate`, certificateRoutes);
app.use(`${API_PREFIX}/intake`, intakeRoutes);

// Explicitly register our Bunny signature processing controller method
app.post(`${API_PREFIX}/webhooks/bunny`, bunnyWebhookController);

// Interactive OpenAPI Interface Route Mapping
app.use(`${API_PREFIX}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/* -------------------------------------------------------------------------- */
/*                               GLOBAL ERROR TERMINUS                        */
/* -------------------------------------------------------------------------- */
app.use(errorHandler);

export default app;
