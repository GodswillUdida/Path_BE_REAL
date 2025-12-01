import express, {
  Application,
  Request,
  Response,
  NextFunction,
  json,
  raw,
  urlencoded,
} from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { join } from "path";
import { hostname } from "os";
import cookieParser from "cookie-parser";
import authRoutes from "./modules/auth/auth.routes";
import courseRoutes from "./modules/course/course.routes";
import programRoutes from "./modules/program/program.routes";
import moduleRoutes from "./modules/module/module.routes";
import topicRoutes from "./modules/topic/topic.routes";
import enrollmentRoutes from "./modules/enrollment/enrollment.routes";
import orderRoutes from "./modules/order/order.routes";
import paymentRoutes from "./modules/payment/payment.routes";

import { corsOptions } from "./middleware/cors";
import { uptime } from "process";

const app: Application = express();

// --- Core security + performance middleware ---

app.use(helmet());
app.use(cors(corsOptions));

// For all API routes except webhooks
app.use(
  json({
    limit: "2mb",
  })
);

app.use(cookieParser());
app.use(compression());

// Logging (env controlled)
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.use(urlencoded({ extended: true }));

// EJS for internal email previews or admin templates
app.set("views", join(__dirname, "views"));
app.set("view engine", "ejs");

// --- Webhook raw body handler (must be before normal JSON parsing) ---
app.use("/api/paystack/webhook", raw({ type: "*/*", limit: "2mb" }));

// --- API Routes ---
// app.use("/api", router);
app.use("/api/auth", authRoutes);
app.use("/api/programs", programRoutes);
app.use("/api/course", courseRoutes);
app.use("/api/modules", moduleRoutes);
app.use("/api/topics", topicRoutes);
app.use("/api/enrollment", enrollmentRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/payment", paymentRoutes);

// --- Root Route ---
app.get("/", (req: Request, res: Response) => {
  const ip =
    req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";

  const userAgent = req.headers["user-agent"] ?? "unknown";

  res.status(200).json({
    success: true,
    message:
      "Welcome to the Accountant Pathfinder API. You probably shouldn't be here, but...",
    // "Welcome to the Accountant Pathfinder Backend API! Visit /docs for API documentation.",
    device: hostname(),
    version: process.env.npm_package_version || "unknown",
    service: "Accountant Pathfinder Backend API",
    ip,
    userAgent,
  });
});

// --- Health Check ---
app.get("/health", async (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: uptime(),
  });
});

// --- Central Error Handler ---
app.use(
  (
    err: Error & { status?: number },
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    const status = err.status ?? 500;

    res.status(status).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
);

export default app;
