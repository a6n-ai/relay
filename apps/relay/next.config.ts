import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.join(import.meta.dirname, "..", "..");
const turbopackRoot = path.join(repoRoot, "..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole: { exclude: ["error", "warn"] },
  },
  serverExternalPackages: ["postgres", "drizzle-orm"],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "@foundry/ui"],
  },
  transpilePackages: [
    "@foundry/auth",
    "@foundry/commons",
    "@foundry/database",
    "@foundry/email",
    "@foundry/routes",
    "@foundry/themes",
    "@foundry/ui",
    "@foundry/design-system",
    "@foundry/realtime",
    "@foundry/crm",
    "@foundry/auth-ui",
    "@relay/engine",
    "@relay/ui",
    "@relay/sdk",
    "@relay/sms",
    "@relay/whatsapp",
    "@scalar/nextjs-api-reference",
  ],
  turbopack: { root: turbopackRoot },
};

export default nextConfig;
