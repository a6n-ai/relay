import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/central/schema.ts",
  out: "./drizzle/central",
});
