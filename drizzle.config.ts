import { defineConfig } from "drizzle-kit";

const DB_URL =
  process.env.APP_MODE === "remote"
    ? "file:./yc_storage/db.sqlite"
    : "file:./storage/db.sqlite";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  dbCredentials: {
    url: DB_URL,
  },
});
