import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { join } from "path";
import { uptime } from "process";

// Routes
import authRoutes from "./modules/auth/auth.routes";
import courseRoutes from "./modules/course/course.routes";
import programRoutes from "./modules/program/program.routes";
import moduleRoutes from "./modules/module/module.routes";
import topicRoutes from "./modules/topic/topic.routes";
import enrollmentRoutes from "./modules/enrollment/enrollment.routes";
import enrollmentRequestRoutes from "./modules/enrollmentRequest/enrollmentRequest.route";
import orderRoutes from "./modules/order/order.routes";
import paymentRoutes from "./modules/payment/payment.routes";

// Middleware & utils
import { corsOptions } from "./middleware/cors";
import { errorHandler, AppError } from "./middleware/error";
import logger from "./utils/logger";
// import RedisStore from "rate-limit-redis";
// import redis from "./utils/redisClient";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import prisma from "./lib/prisma";

const app: Application = express();
const isProduction = process.env.NODE_ENV === "production";
const BODY_LIMIT = "2mb";

/* -------------------------------------------------------------------------- */
/*                               SECURITY LAYER                               */
/* -------------------------------------------------------------------------- */

app.use(
  helmet({
    contentSecurityPolicy: isProduction ? undefined : false,
  })
);

app.use(cors(corsOptions));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: "Too many requests. Try again later.",
    },
    // store: new RedisStore({
    //   sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args),
    // }),
  })
);

/* -------------------------------------------------------------------------- */
/*                               BODY PARSERS                                 */
/* -------------------------------------------------------------------------- */

// Webhooks MUST come before JSON
app.use(
  "/api/paystack/webhook",
  express.raw({ type: "*/*", limit: BODY_LIMIT })
);

// Standard parsers
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use(cookieParser());
app.use(compression());

/* -------------------------------------------------------------------------- */
/*                                   LOGGING                                  */
/* -------------------------------------------------------------------------- */

if (isProduction) {
  app.use(
    morgan("combined", {
      stream: {
        write: (msg) => logger.info(msg.trim()),
      },
    })
  );
} else {
  app.use(morgan("dev"));
}

/* -------------------------------------------------------------------------- */
/*                                   VIEWS                                    */
/* -------------------------------------------------------------------------- */

app.set("views", join(__dirname, "views"));
app.set("view engine", "ejs");

/* -------------------------------------------------------------------------- */
/*                                   ROUTES                                   */
/* -------------------------------------------------------------------------- */

const API = "/api/v1";

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/programs`, programRoutes);
app.use(`${API}/courses`, courseRoutes);
app.use(`${API}/modules`, moduleRoutes);
app.use(`${API}/topics`, topicRoutes);
app.use(`${API}/enrollments`, enrollmentRoutes);
app.use(`${API}/enrollment-requests`, enrollmentRequestRoutes);
app.use(`${API}/orders`, orderRoutes);
app.use(`${API}/payments`, paymentRoutes);
app.use(`${API}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/* -------------------------------------------------------------------------- */
/*                                   SYSTEM                                   */
/* -------------------------------------------------------------------------- */

app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    service: "Accountant's Pathfinder API",
    version: process.env.npm_package_version ?? "unknown",
  });
});

app.get("/health", async (_req: Request, res: Response) => {
  await prisma.$queryRaw`SELECT 1`;
  res.status(200).json({
    status: "ok",
    // uptime: uptime(),
  });
});

/* -------------------------------------------------------------------------- */
/*                                404 HANDLER                                 */
/* -------------------------------------------------------------------------- */

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError("Route not found", 404));
});

/* -------------------------------------------------------------------------- */
/*                               ERROR HANDLER                                */
/* -------------------------------------------------------------------------- */

app.use(errorHandler);

export default app;
