"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importStar(require("express"));
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
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_1 = require("./config/swagger");
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
}));
/* -------------------------------------------------------------------------- */
/*                               BODY PARSERS                                 */
/* -------------------------------------------------------------------------- */
// Webhooks MUST come before JSON
// app.use(
//   "/api/paystack/webhook",
//   express.raw({ type: "*/*", limit: BODY_LIMIT })
// );
// Standard parsers
app.use((0, express_1.json)({ limit: BODY_LIMIT }));
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
app.get("/", (_req, res) => {
    res.status(200).json({
        success: true,
        service: "Accountant's Pathfinder API",
        version: process.env.npm_package_version ?? "unknown",
    });
});
app.get("/health", async (_req, res, next) => {
    try {
        const { default: prisma } = await Promise.resolve().then(() => __importStar(require("./lib/prisma")));
        // await prisma.$queryRaw`SELECT 1`;
        const result = await prisma.$queryRaw `SELECT 1`;
        console.log("DB check:", result);
        res.status(200).json({
            status: "ok",
        });
    }
    catch (error) {
        next(error);
    }
});
/* -------------------------------------------------------------------------- */
/*                                404 HANDLER                                 */
/* -------------------------------------------------------------------------- */
app.use((err, req, res, next) => {
    console.error("PROD ERROR:", err);
    res
        .status(500)
        .json({ success: false, error: err.message || "Internal Server Error" });
    // next(new AppError("Route not found", 404));
});
/* -------------------------------------------------------------------------- */
/*                               ERROR HANDLER                                */
/* -------------------------------------------------------------------------- */
app.use(error_1.errorHandler);
exports.default = app;
