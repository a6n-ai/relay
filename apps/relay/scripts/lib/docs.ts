import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildEnv } from "./build-env.ts";

const APP_DIR = fileURLToPath(new URL("../../", import.meta.url));
const DOCS_DIST = fileURLToPath(new URL("../../../relay-docs/dist", import.meta.url));
const DOCS_PUBLIC = fileURLToPath(new URL("../../public/docs", import.meta.url));

// Replaces dest with a copy of src, so a page deleted from the docs never lingers in the client build.
export function copyDocs(src: string, dest: string): void {
  if (!existsSync(src)) throw new Error(`docs build output missing: ${src}`);
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
}

// Runs before `vite build` (pnpm build and scripts/deploy.ts both): the Cloudflare plugin ships public/ as dist/client, so public/docs is served at /docs.
export function buildDocs(): void {
  const res = spawnSync("pnpm", ["--filter", "relay-docs", "build"], { cwd: APP_DIR, stdio: "inherit", env: buildEnv() });
  if (res.status !== 0) throw new Error(`relay-docs build exited with ${res.status}`);
  copyDocs(DOCS_DIST, DOCS_PUBLIC);
}
