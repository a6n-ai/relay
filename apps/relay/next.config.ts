import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.join(import.meta.dirname, "..", "..");
const parentRoot = path.join(repoRoot, "..");
// Next 16 requires outputFileTracingRoot === turbopack.root. Local clones sit
// under a6n-ai next to foundry so Tailwind @source can scan sibling packages.
// Docker/CI have no sibling; Foundry is in node_modules and the tracing root
// must stay this repo or standalone COPY paths break.
const workspaceRoot = existsSync(path.join(parentRoot, "foundry"))
  ? parentRoot
  : repoRoot;

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
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
  turbopack: { root: workspaceRoot },
};

export default nextConfig;
