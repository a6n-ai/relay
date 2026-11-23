import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    tanstackStart(),
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { d1Databases: ["CENTRAL"] },
    }),
  ],
});
