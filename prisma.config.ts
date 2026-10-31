import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Read directly because prisma's env() helper throws when the variable is missing,
    // which would break the postinstall client generation on a fresh clone with no .env.
    url: process.env.DATABASE_URL,
  },
});
