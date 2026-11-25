import { defineConfig } from "vitest/config";
import path from "node:path";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://pf:pf@localhost:55432/pf_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/setup/global-setup.ts"],
    setupFiles: ["tests/setup/env.ts"],
    // Integration tests share one database; run files serially so
    // truncation in one file cannot race another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: { DATABASE_URL: TEST_DATABASE_URL, TEST_DATABASE_URL },
  },
});
