// // src/config/session.ts
// import session from "express-session";
// import { RedisStore } from "connect-redis";
// // import redis from "./redis";           // ← Your centralized Redis client
// import logger from "../utils/logger";
// import dotenv from "dotenv";

// dotenv.config();

// const isProduction = process.env.NODE_ENV === "production";

// const redisStore = new RedisStore({
//   client: redis,                      // Reuse the same connection
//   prefix: "sess:",                    // Namespace for sessions
//   ttl: 7 * 24 * 60 * 60,              // 7 days (in seconds)
//   disableTouch: false,                // Recommended: refresh TTL on access
// });

// // Main session middleware
// export const sessionMiddleware = session({
//   store: redisStore,
//   name: process.env.SESSION_COOKIE_NAME || "sid",
//  secret: process.env.SESSION_SECRET || "fallback-secret-change-in-production",
  
//   resave: false,                         // Don't save unchanged sessions
//   saveUninitialized: false,              // Don't create session until something is stored
  
//   cookie: {
//     httpOnly: true,
//     secure: isProduction,                // false in dev, true in prod (HTTPS)
//     sameSite: isProduction ? "none" : "lax",
//     maxAge: 7 * 24 * 60 * 60 * 1000,     // 7 days in milliseconds
//     ...(isProduction && process.env.COOKIE_DOMAIN 
//       ? { domain: process.env.COOKIE_DOMAIN } 
//       : {}),
//   },
// });

// // Optional: Helper to destroy a specific session (useful for logoutAll)
// export const destroySession = async (sessionId: string): Promise<void> => {
//   try {
//     await redisStore.destroy(sessionId);
//     logger.info(`Session destroyed: ${sessionId}`);
//   } catch (error) {
//     logger.error("Failed to destroy session:", error);
//   }
// };

// export default sessionMiddleware;