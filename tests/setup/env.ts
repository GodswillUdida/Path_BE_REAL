// Minimal environment for modules that read process.env at import time.
// External services (Redis/BullMQ, email) are mocked per test file.

// Vite/Vitest may expose BASE_URL="/".
// Override it because envConfig validates BASE_URL as a full URL.
process.env.BASE_URL = "https://app.example.test";

process.env.NODE_ENV = "test";
process.env.ACCESS_COOKIE_NAME ??= "access_token";
process.env.REFRESH_COOKIE_NAME ??= "refresh_token";
process.env.BCRYPT_SALT_ROUNDS ??= "4";
process.env.FRONTEND_URL ??= "https://app.example.test";

// Dedicated test-only secret; never use this value in production.
process.env.PENDING_REGISTRATION_SECRET =
  "test-only-pending-registration-secret-32chars";