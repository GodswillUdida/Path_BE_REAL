"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = require("path");
// Routes
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const course_routes_1 = __importDefault(require("./modules/course/course.routes"));
const program_routes_1 = __importDefault(require("./modules/program/program.routes"));
const module_routes_1 = __importDefault(require("./modules/module/module.routes"));
const topic_routes_1 = __importDefault(require("./modules/topic/topic.routes"));
const enrollment_routes_1 = __importDefault(require("./modules/enrollment/enrollment.routes"));
const enrollmentRequest_route_1 = __importDefault(require("./modules/enrollmentRequest/enrollmentRequest.route"));
const order_routes_1 = __importDefault(require("./modules/order/order.routes"));
const payment_routes_1 = __importDefault(require("./modules/payment/payment.routes"));
// Middleware & utils
const cors_2 = require("./middleware/cors");
const error_1 = require("./middleware/error");
const logger_1 = __importDefault(require("./utils/logger"));
// import RedisStore from "rate-limit-redis";
// import redis from "./utils/redisClient";
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_1 = require("./config/swagger");
const prisma_1 = __importDefault(require("./lib/prisma"));
const app = (0, express_1.default)();
const isProduction = process.env.NODE_ENV === "production";
const BODY_LIMIT = "2mb";
/* -------------------------------------------------------------------------- */
/*                               SECURITY LAYER                               */
/* -------------------------------------------------------------------------- */
app.use((0, helmet_1.default)({
    contentSecurityPolicy: isProduction ? undefined : false,
}));
app.use((0, cors_1.default)(cors_2.corsOptions));
app.use((0, express_rate_limit_1.default)({
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
}));
/* -------------------------------------------------------------------------- */
/*                               BODY PARSERS                                 */
/* -------------------------------------------------------------------------- */
// Webhooks MUST come before JSON
app.use("/api/paystack/webhook", express_1.default.raw({ type: "*/*", limit: BODY_LIMIT }));
// Standard parsers
app.use(express_1.default.json({ limit: BODY_LIMIT }));
app.use(express_1.default.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use((0, cookie_parser_1.default)());
app.use((0, compression_1.default)());
/* -------------------------------------------------------------------------- */
/*                                   LOGGING                                  */
/* -------------------------------------------------------------------------- */
if (isProduction) {
    app.use((0, morgan_1.default)("combined", {
        stream: {
            write: (msg) => logger_1.default.info(msg.trim()),
        },
    }));
}
else {
    app.use((0, morgan_1.default)("dev"));
}
/* -------------------------------------------------------------------------- */
/*                                   VIEWS                                    */
/* -------------------------------------------------------------------------- */
app.set("views", (0, path_1.join)(__dirname, "views"));
app.set("view engine", "ejs");
/* -------------------------------------------------------------------------- */
/*                                   ROUTES                                   */
/* -------------------------------------------------------------------------- */
const API = "/api/v1";
app.use(`${API}/auth`, auth_routes_1.default);
app.use(`${API}/programs`, program_routes_1.default);
app.use(`${API}/courses`, course_routes_1.default);
app.use(`${API}/modules`, module_routes_1.default);
app.use(`${API}/topics`, topic_routes_1.default);
app.use(`${API}/enrollments`, enrollment_routes_1.default);
app.use(`${API}/enrollment-requests`, enrollmentRequest_route_1.default);
app.use(`${API}/orders`, order_routes_1.default);
app.use(`${API}/payments`, payment_routes_1.default);
app.use(`${API}/docs`, swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec));
/* -------------------------------------------------------------------------- */
/*                                   SYSTEM                                   */
/* -------------------------------------------------------------------------- */
app.get("/", (_req, res) => {
    res.status(200).json({
        success: true,
        service: "Accountant's Pathfinder API",
        version: process.env.npm_package_version ?? "unknown",
    });
});
app.get("/health", async (_req, res) => {
    await prisma_1.default.$queryRaw `SELECT 1`;
    res.status(200).json({
        status: "ok",
        // uptime: uptime(),
    });
});
/* -------------------------------------------------------------------------- */
/*                                404 HANDLER                                 */
/* -------------------------------------------------------------------------- */
app.use((_req, _res, next) => {
    next(new error_1.AppError("Route not found", 404));
});
/* -------------------------------------------------------------------------- */
/*                               ERROR HANDLER                                */
/* -------------------------------------------------------------------------- */
app.use(error_1.errorHandler);
exports.default = app;
