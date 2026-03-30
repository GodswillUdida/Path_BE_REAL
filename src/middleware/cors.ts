// config/cors.ts
import { CorsOptions } from "cors";

const allowedOrigins = [
  process.env.FRONTEND_URL,                    // Production frontend
  "http://localhost:3000",                     // Next.js dev
  "http://localhost:5173",                     // Vite dev (if any)
  "https://accountant-pathfinder.vercel.app",  // Vercel production
  "https://dvcyq7-3000.csb.app",               // CodeSandbox
  "https://jckxpr-3000.csb.app",
  "https://jckxpr-3001.csb.app",
  "https://sturdy-spoon-x5px4xv6v6x53465-3000.app.github.dev",
].filter(Boolean); // Remove undefined/null

// For development, be more permissive
const isDevelopment = process.env.NODE_ENV === "development";

export const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    // In development, allow everything (including localhost variations)
    if (isDevelopment) {
      return callback(null, true);
    }

    // In production: strict check
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },

  credentials: true,                    // ← Critical for httpOnly cookies
  optionsSuccessStatus: 204,

  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],

  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Access-Control-Allow-Origin", // Important for CORS preflight
    "X-CSRF-Token",                     // Good to have for future
  ],

  // Optional: expose headers if needed
  exposedHeaders: ["Set-Cookie"],       // Important when backend sets cookies
};

export default corsOptions;