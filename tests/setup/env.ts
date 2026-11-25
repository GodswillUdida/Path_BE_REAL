// Minimal env so modules that read process.env at import time load.
// External services (Redis/BullMQ, email) are mocked per test file.
process.env.NODE_ENV = "test";
process.env.ACCESS_COOKIE_NAME ??= "access_token";
process.env.REFRESH_COOKIE_NAME ??= "refresh_token";
