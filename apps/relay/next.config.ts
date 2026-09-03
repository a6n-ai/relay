import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(import.meta.dirname, "..", "..", "..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
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
  turbopack: { root: monorepoRoot },
};

export default nextConfig;
