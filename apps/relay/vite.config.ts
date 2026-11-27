import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dev OTP route is left out of the production route tree; the dev server keeps it.
// The router matches this pattern against the file name only, so it is unique to api/dev/otp.ts.
export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({ router: { routeFileIgnorePattern: mode === "production" ? "^otp\\.ts$" : undefined } }),
    react(),
  ],
}));
