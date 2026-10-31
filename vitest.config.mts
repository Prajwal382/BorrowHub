import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const { TEST_DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set. Copy .env.example to .env.");
}

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      // server-only throws outside a React server build, so tests use its empty entry.
      "server-only": fromRoot("./node_modules/server-only/empty.js"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // Tests share one database, so test files must not run at the same time.
    fileParallelism: false,
    env: {
      // Everything under test, including src/lib/db.ts, connects to the test database only.
      DATABASE_URL: TEST_DATABASE_URL,
      SESSION_SECRET: "test-only-session-secret-at-least-32-characters",
    },
  },
});
