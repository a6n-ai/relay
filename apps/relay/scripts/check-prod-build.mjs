// Builds for production and fails if the dev-only OTP route reached the route tree or the server bundle.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEnv } from "./lib/build-env.ts";
import { DEV_OTP_FLAG, DEV_OTP_ROUTE } from "./lib/dev-otp.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const tree = join(root, "src/routeTree.gen.ts");
const committed = readFileSync(tree, "utf8");
const FORBIDDEN = [DEV_OTP_ROUTE, DEV_OTP_FLAG];

// The router ignores files by basename only, so the route ids must differ by exactly the dev OTP route.
const routeIds = (text) => {
  const block = text.match(/export interface FileRoutesById \{([\s\S]*?)\n\}/)?.[1] ?? "";
  return new Set([...block.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]));
};

try {
  execFileSync(join(root, "node_modules/.bin/vite"), ["build"], { cwd: root, stdio: "inherit", env: buildEnv() });
  const bad = [];
  const prodIds = routeIds(readFileSync(tree, "utf8"));
  const committedIds = routeIds(committed);
  const missing = [...committedIds].filter((r) => !prodIds.has(r));
  const extra = [...prodIds].filter((r) => !committedIds.has(r));
  if (committedIds.size === 0) bad.push("could not read route ids from src/routeTree.gen.ts");
  if (missing.join() !== DEV_OTP_ROUTE || extra.length) {
    bad.push(`route ids differ from the committed tree: missing [${missing}], extra [${extra}]; expected only ${DEV_OTP_ROUTE} missing`);
  }
  for (const [name, text] of [["src/routeTree.gen.ts", readFileSync(tree, "utf8")]]) {
    for (const s of FORBIDDEN) if (text.includes(s)) bad.push(`${name}: ${s}`);
  }
  const serverDir = join(root, "dist/server");
  if (!existsSync(serverDir)) throw new Error("dist/server missing after build");
  for (const f of readdirSync(serverDir, { recursive: true })) {
    if (!/\.(js|map)$/.test(f)) continue;
    const text = readFileSync(join(serverDir, f), "utf8");
    for (const s of FORBIDDEN) if (text.includes(s)) bad.push(`dist/server/${f}: ${s}`);
  }
  if (bad.length) {
    console.error(`dev OTP route in production build:\n${bad.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("ok: no dev OTP route in the production route tree or server bundle");
  }
} finally {
  writeFileSync(tree, committed);
}
