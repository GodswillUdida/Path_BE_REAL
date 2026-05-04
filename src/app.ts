import express, {
  Application,
  json,
} from "express";
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

// Routes
import authRoutes from "./modules/auth/auth.routes";
import courseRoutes from "./modules/course/course.routes";
import programRoutes from "./modules/program/program.routes";
import moduleRoutes from "./modules/module/module.routes";
import topicRoutes from "./modules/topic/topic.routes";
import enrollmentRoutes from "./modules/enrollment/enrollment.routes";
import orderRoutes from "./modules/order/order.routes";
import paymentRoutes from "./modules/payment/payment.routes";

const app: Application = express();
const isProduction = process.env.NODE_ENV === "production";
const BODY_LIMIT = "1mb";
const COOKIE_SECRET = process.env.COOKIE_SECRET || "default_cookie_secret_change_me_in_production";

/* -------------------------------------------------------------------------- */
/*  PROXY TRUST — must be line 1, before any middleware reads req.secure/ip   */
/* -------------------------------------------------------------------------- */

// Render, Railway, Heroku, Fly.io all sit behind a reverse proxy.
// Without this, req.secure === false even on HTTPS, and Express silently
// drops every cookie with secure: true.
app.set("trust proxy", 1);

/* -------------------------------------------------------------------------- */
/*                               SECURITY LAYER                               */
/* -------------------------------------------------------------------------- */

// cors() must come before all route middleware and before cookieParser
app.use(cors(corsOptions));

// Remove the manual Access-Control-Allow-Credentials middleware — corsOptions
// already handles this. Two sources of truth for the same header = conflicts.

app.use(
  helmet({
    contentSecurityPolicy: isProduction ? undefined : false,
  }),
);

app.use(cookieParser(COOKIE_SECRET));

// app.use(passport.initialize());
// app.use(passport.session());

/* -------------------------------------------------------------------------- */
/*                               RATE LIMITING                                */
/* -------------------------------------------------------------------------- */

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

/* -------------------------------------------------------------------------- */
/*                         WEBHOOK ROUTES (raw body)                          */
/*   Must be registered BEFORE json() middleware strips the raw body          */
/* -------------------------------------------------------------------------- */

app.use(
  "/api/v1/payments/paystack/webhook",
  express.raw({ type: "application/json", limit: BODY_LIMIT }),
);

/* -------------------------------------------------------------------------- */
/*                               BODY PARSERS                                 */
/* -------------------------------------------------------------------------- */

app.use(json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use(compression());

/* -------------------------------------------------------------------------- */
/*                                   LOGGING                                  */
/* -------------------------------------------------------------------------- */

app.use(
  morgan(isProduction ? "combined" : "dev", {
    stream: isProduction
      ? { write: (msg) => logger.info(msg.trim()) }
      : undefined,
  }),
);

/* -------------------------------------------------------------------------- */
/*                                   VIEWS                                    */
/* -------------------------------------------------------------------------- */

app.set("views", join(__dirname, "views"));
app.set("view engine", "ejs");

/* -------------------------------------------------------------------------- */
/*                               SYSTEM ROUTES                                */
/* -------------------------------------------------------------------------- */

app.get("/health", async (_req, res) => {
  try {
    const { default: prisma } = await import("./lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV ?? "production",
    });
  } catch {
    res.status(503).json({ status: "unhealthy" });
  }
});

app.get("/health/redis", async (req, res) => {
  try {
    // const { default: redis } = await import("./config/redis");
    // await redis.ping();
    res.json({ status: "healthy", redis: "connected" });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", redis: "disconnected" });
  }
});

app.get("/", (_req, res) => res.status(200).send("OK"));

/* -------------------------------------------------------------------------- */
/*                               API ROUTES                                   */
/* -------------------------------------------------------------------------- */

const API = "/api/v1";

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/programs`, programRoutes);
app.use(`${API}/courses`, courseRoutes);
app.use(`${API}/modules`, moduleRoutes);
app.use(`${API}/topics`, topicRoutes);
app.use(`${API}/enrollments`, enrollmentRoutes);
app.use(`${API}/orders`, orderRoutes);
app.use(`${API}/payments`, paymentRoutes);
app.use(`${API}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/* -------------------------------------------------------------------------- */
/*                               ERROR HANDLER                                */
/* -------------------------------------------------------------------------- */

app.use(errorHandler);

export default app;
