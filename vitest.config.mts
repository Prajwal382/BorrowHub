import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const { TEST_DATABASE_URL } = process.env;

if (!TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set. Copy .env.example to .env.");
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Tests share one database, so test files must not run at the same time.
    fileParallelism: false,
    // Everything under test, including src/lib/db.ts, connects to the test database only.
    env: { DATABASE_URL: TEST_DATABASE_URL },
  },
});
