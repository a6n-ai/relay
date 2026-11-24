import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";

const securityMigrations = await readD1Migrations("./drizzle/security");
const coreMigrations = await readD1Migrations("./drizzle/core");

export default defineConfig({
  plugins: [
    tanstackStart(),
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        d1Databases: ["SECURITY_DB", "CORE_DB"],
        bindings: {
          TEST_SECURITY_MIGRATIONS: securityMigrations,
          TEST_CORE_MIGRATIONS: coreMigrations,
          OTP_MAILER: "memory",
          INVITE_MAILER: "memory",
          SES_TRANSPORT: "memory",
          SES_EVENT_TOPIC_ARNS: "arn:aws:sns:ap-south-1:947042607945:relay-ses-events",
          BETTER_AUTH_SECRET: "k7Qz2mVx9LrT4wNp8sHc3YbF6jDa1eUg0oRi5tKl",
          BETTER_AUTH_URL: "http://localhost",
          SEED_SECRET: "test-seed-secret-7Hq2vLx9",
          INTERNAL_SECRET: "test-internal-secret-4Lm8pQw2",
          WEBHOOK_SECRET_KEY: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
          UNSUBSCRIBE_SECRET: "sJndhhCU1+8YgHoYt/G7fKwRvSbciKHC/P1iRnbIYmQ=",
        },
      },
    }),
  ],
});
