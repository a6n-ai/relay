import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./drizzle/central");

export default defineConfig({
  plugins: [
    tanstackStart(),
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        d1Databases: ["CENTRAL"],
        bindings: {
          TEST_MIGRATIONS: migrations,
          OTP_MAILER: "memory",
          BETTER_AUTH_SECRET: "k7Qz2mVx9LrT4wNp8sHc3YbF6jDa1eUg0oRi5tKl",
          BETTER_AUTH_URL: "http://localhost",
          SEED_SECRET: "test-seed-secret-7Hq2vLx9",
        },
      },
    }),
  ],
});
