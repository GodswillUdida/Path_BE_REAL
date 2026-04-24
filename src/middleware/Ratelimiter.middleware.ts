import rateLimit from "express-rate-limit";
// import RedisStore from "express-rate-limit";

/**
 * Strict limiter for sensitive auth endpoints (login, OTP, password reset).
 * 10 requests per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again in 15 minutes.",
  },
//   store: redisClient
//     ? new RedisStore({
//         sendCommand: (...args: string[]) => redisClient.call(...args),
//         prefix: "rl:auth:",
//       })
//     : undefined, // Falls back to in-memory store if Redis unavailable
});

// app.use(
//   "/api",
//   rateLimit({
//     windowMs: 15 * 60 * 1000,
//     max: 100,
//     standardHeaders: true,
//     legacyHeaders: false,
//   }),
// );

/**
 * Looser limiter for non-sensitive read endpoints.
 * 100 requests per 15 minutes per IP.
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "We're receiving a lot of requests from your IP. Please try again in a little while.",
  },
});

export const createTopicRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each user to 5 topic creations per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many topic creation attempts. Please try again in a minute.",
  },
});
