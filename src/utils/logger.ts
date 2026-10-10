import winston from "winston";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

// LOG_LEVEL env var wins if set; otherwise sane per-environment default.
const level = process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug");

// Identifies which process emitted a line once logs are aggregated —
// set via SERVICE_NAME in each docker-compose service (api / worker).
const service = process.env.SERVICE_NAME ?? "pathfinder-service";

const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} [${service}] ${level}: ${stack || message}${rest}`;
  }),
);

const logger = winston.createLogger({
  level,
  defaultMeta: { service },
  format: jsonFormat,
  silent: isTest, // don't spam test output; flip on manually if debugging a failing test
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
  ],
  exceptionHandlers: [new winston.transports.Console({ format: consoleFormat })],
  rejectionHandlers: [new winston.transports.Console({ format: consoleFormat })],
});

// Opt-in file logging for local/bare-metal use only — never in containers,
// where stdout is already captured by Docker. Off by default.
if (process.env.LOG_TO_FILE === "true") {
  const path = require("path");
  const fs = require("fs");
  const logDir = path.join(__dirname, "../../logs");
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  );
  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  );
}

export default logger;