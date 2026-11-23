import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./drizzle/central");

export default defineConfig({
  plugins: [
    tanstackStart(),
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { d1Databases: ["CENTRAL"], bindings: { TEST_MIGRATIONS: migrations } },
    }),
  ],
});
