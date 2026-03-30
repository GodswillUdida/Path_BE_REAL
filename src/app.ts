import express, {
  Application,
  Request,
  Response,
  NextFunction,
  json,
} from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { join } from "path";

// Routes
import authRoutes from "./modules/auth/auth.routes";
import courseRoutes from "./modules/course/course.routes";
import programRoutes from "./modules/program/program.routes";
import moduleRoutes from "./modules/module/module.routes";
import topicRoutes from "./modules/topic/topic.routes";
import enrollmentRoutes from "./modules/enrollment/enrollment.routes";
// import enrollmentRequestRoutes from "./modules/enrollmentRequest/enrollmentRequest.route";
import orderRoutes from "./modules/order/order.routes";
import paymentRoutes from "./modules/payment/payment.routes";

// Middleware & utils
import { corsOptions } from "./middleware/cors";
import { errorHandler, AppError } from "./middleware/error";
import logger from "./utils/logger";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import passport from "./config/passport";
// import session from "express-session";

const app: Application = express();
const isProduction = process.env.NODE_ENV === "production";
const BODY_LIMIT = "1mb";

/* -------------------------------------------------------------------------- */
/*                               SECURITY LAYER                               */
/* -------------------------------------------------------------------------- */

app.use(cors(corsOptions));
app.use(cookieParser());


// app.use(
//   session({
//     secret: process.env.SESSION_SECRET || 'keyboard cat',
//     resave: false,
//     saveUninitialized: true,
//     cookie: { 
//       secure: isProduction, // Set to true in production (requires HTTPS)
//       httpOnly: true,       // Mitigates XSS attacks by preventing client-side access
//       maxAge: 1000 * 60 * 60 * 24, // 1 day
//     },
//   })
// );

if (isProduction) {
  app.set('trust proxy', 1) // trust first proxy
  // session.cookie.secure = true // serve secure cookies
}

// Passport middleware
app.use(passport.initialize());
// app.use(passport.session());

// passport.initialize();

app.get("/health", async (_req, res) => {
  try {
    const { default: prisma } = await import("./lib/prisma");
    await prisma.$queryRaw`SELECT 1`;

  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "production",
  });
  } catch {
    res.status(503).json({ status: "unhealthy" });
  }
});

app.get("/", (_req, res) => {
  res.status(200).send("OK");
  // res.status(200).json({
  //   success: true,
  //   service: "Accountant's Pathfinder API",
  //   version: process.env.npm_package_version ?? "unknown",
  // });
});

// app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: isProduction ? undefined : false,
  }),
);



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
/*                               BODY PARSERS                                 */
/* -------------------------------------------------------------------------- */

// Webhooks MUST come before JSON

// app.use(
//   "/api/v1/payments/paystack/webhook",
//   express.raw({ type: "application/json", limit:BODY_LIMIT }),
// );

// Standard parsers
app.use(json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
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
    }),
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

// app.post(
//   "/api/topics/webhooks/bunny",
//   express.raw({ type: "application/json" }),
//   bunnyWebhookController,
// );

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/programs`, programRoutes);
app.use(`${API}/courses`, courseRoutes);
app.use(`${API}/modules`, moduleRoutes);
app.use(`${API}/topics`, topicRoutes);
app.use(`${API}/enrollments`, enrollmentRoutes);
// app.use(`${API}/enrollment-requests`, enrollmentRequestRoutes);
app.use(`${API}/orders`, orderRoutes);
app.use(`${API}/payments`, paymentRoutes);
app.use(`${API}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// app.use(`${API}/docs`, async (_req, _res, next) => {
//   try {
//     const swaggerUi = await import("swagger-ui-express");
//     const { swaggerSpec } = await import("./config/swagger");
//     swaggerUi.serve(_req, _res, () =>
//       swaggerUi.setup(swaggerSpec)(_req, _res, next)
//     );
//   } catch (err) {
//     next(err);
//   }
// });

/* -------------------------------------------------------------------------- */
/*                                   SYSTEM                                   */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                                404 HANDLER                                 */
/* -------------------------------------------------------------------------- */

// app.use((err: any, req: Request, res: Response, next: NextFunction) => {
//   console.error("PROD ERROR:", err);
//   res
//     .status(500)
//     .json({ success: false, error: err.message || "Internal Server Error" });
//   // next(new AppError("Route not found", 404));
// });

/* -------------------------------------------------------------------------- */
/*                               ERROR HANDLER                                */
/* -------------------------------------------------------------------------- */

app.use(errorHandler);

export default app;