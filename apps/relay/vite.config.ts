import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { DEV_OTP_FILE_PATTERN } from "./scripts/lib/dev-otp.ts";

// The dev OTP route is left out of the production route tree; the dev server keeps it.
export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({ router: { routeFileIgnorePattern: mode === "production" ? DEV_OTP_FILE_PATTERN : undefined } }),
    react(),
  ],
}));
