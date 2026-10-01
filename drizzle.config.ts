import { defineConfig } from "drizzle-kit";

export default defineConfig(
  process.env.DATABASE_URL
    ? { dialect: "postgresql", schema: "./src/db/schema.ts", dbCredentials: { url: process.env.DATABASE_URL } }
    : { dialect: "postgresql", driver: "pglite", schema: "./src/db/schema.ts", dbCredentials: { url: ".pglite" } },
);
