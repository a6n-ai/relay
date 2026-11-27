import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/security/schema.ts",
  out: "./drizzle/security",
});
