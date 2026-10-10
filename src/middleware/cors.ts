// config/cors.ts
import { CorsOptions } from "cors";


if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_URL) {
  throw new Error(
    "[CORS] FRONTEND_URL environment variable is not set. " +
    "All cross-origin requests from the production frontend will be blocked."
  );
}

// Explicit allowlist — never use a runtime-built array that could
// include undefined if an env var is missing
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  process.env.FRONTEND_URL,                              // Primary production URL
  "http://localhost:3000",
  "http://localhost:5000",
  "https://accountant-pathfinder.vercel.app",
  "*"
].filter(Boolean) as string[]);

const isDevelopment = process.env.NODE_ENV !== "production";

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // No origin = server-to-server, Postman, curl — allow
    if (!origin) return callback(null, true);

    // Dev: allow all origins so localhost variants never block you
    if (isDevelopment) return callback(null, true);

    // Prod: strict allowlist only
    if (ALLOWED_ORIGINS.has(origin)) {
      return callback(null, true);
    }

    // Log blocked origins in prod so you can diagnose quickly
    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(new Error(`CORS policy: origin ${origin} is not allowed`));
  },

  credentials: true,         // Required for HttpOnly cookie transport

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",          // Required for JSON bodies
    "Authorization",         // For any Bearer token flows
    "X-Requested-With",      // Convention for AJAX identification
    "X-CSRF-Token",          // Ready for CSRF protection
    "Access-Control-Allow-Origin",
    "x-device-fingerprint", // Custom header for device fingerprinting
  ],
};

export default corsOptions;