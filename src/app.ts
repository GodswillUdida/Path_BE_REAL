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
const passport = require("passport");
import { configureGoogleStrategy } from "./modules/auth/google.strategy";


// Route Module Imports
import authRoutes from "./modules/auth/auth.routes";
import courseRoutes from "./modules/course/course.routes";
import programRoutes from "./modules/program/program.routes";
import moduleRoutes from "./modules/module/module.routes";
import topicRoutes from "./modules/topic/topic.routes";
import enrollmentRoutes from "./modules/enrollment/enrollment.routes";
import enrollmentAdminRoutes from "./modules/enrollment/enrollment.admin.routes";
import orderRoutes from "./modules/order/order.routes";
import paymentRoutes from "./modules/payment/payment.routes";
import progresessRoutes from "./modules/progress/progress.routes";
import certificateRoutes from "./modules/certificate/certificate.routes";
import intakeRoutes from "./modules/intake/intake.routes";
import { cohortAdminRouter, cohortPublicRouter } from "./modules/cohort/cohort.routes";
import { bunnyWebhookController } from "./modules/topic/topic.controller";
import { redisHealthCheck } from "./lib/queues/redis-health";

const app: Application = express();
const isProduction = process.env.NODE_ENV === "production";
const BODY_LIMIT = "1mb";
const API_PREFIX = "/api/v1";
const COOKIE_SECRET = process.env.COOKIE_SECRET || "default_cookie_secret_change_me_in_production";

app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors(corsOptions));
app.use(compression());
app.use(morgan(isProduction ? "combined" : "dev"));
app.use(cookieParser(COOKIE_SECRET));

configureGoogleStrategy();
app.use(passport.initialize());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, please try again later." },
  }),
);

app.post(
  `${API_PREFIX}/payments/paystack/webhook`,
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    (req as any).rawBody = req.body;
    next();
  },
);

app.use(json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

app.get("/health", async (_req, res) => {
  const redis = await redisHealthCheck();
  res.status(200).json({ status: true, redis });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    status: true,
    message: "Welcome to Accountant Pathfinder API ✔🚀, Explore 🌍",
    data: { service: "pathfinder-api", version: "1.0" },
  });
});

app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/programs`, programRoutes);
app.use(`${API_PREFIX}/courses`, courseRoutes);
app.use(`${API_PREFIX}/modules`, moduleRoutes);
app.use(`${API_PREFIX}/topics`, topicRoutes);
app.use(`${API_PREFIX}/enrollments`, enrollmentRoutes);
app.use(`${API_PREFIX}/admin/enrollments`, enrollmentAdminRoutes);
app.use(`${API_PREFIX}/orders`, orderRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/progress`, progresessRoutes);
app.use(`${API_PREFIX}/certificate`, certificateRoutes);
app.use(`${API_PREFIX}/intake`, intakeRoutes);
app.use(`${API_PREFIX}/cohorts`, cohortPublicRouter);
app.use(`${API_PREFIX}/admin/cohorts`, cohortAdminRouter);

app.post(`${API_PREFIX}/webhooks/bunny`, bunnyWebhookController);

app.use(`${API_PREFIX}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(errorHandler);

export default app;
