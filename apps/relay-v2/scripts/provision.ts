// Creates only the missing D1, R2 and queue resources named in wrangler.jsonc. Dry-run unless --apply; never deletes.
import { readFileSync } from "node:fs";
import { wrangler, wranglerJson, WRANGLER_CONFIG } from "./lib/run.ts";
import { missing, parseWranglerJsonc } from "./lib/wrangler-config.ts";

const apply = process.argv.includes("--apply");
const desired = parseWranglerJsonc(readFileSync(WRANGLER_CONFIG, "utf8"));
const d1Names = desired.d1.map((d) => d.name);

if (!apply) {
  for (const name of d1Names) console.log(`plan: D1 ${name} (create if missing)`);
  for (const name of desired.r2) console.log(`plan: R2 bucket ${name} (create if missing)`);
  for (const name of desired.queues) console.log(`plan: queue ${name} (create if missing)`);
  console.log("dry-run: no Cloudflare calls made. Re-run with --apply to create what is missing.");
  process.exit(0);
}

const d1Before = wranglerJson<{ name: string }[]>(["d1", "list"]);
for (const name of missing(d1Names, d1Before.map((d) => d.name))) {
  console.log(`create D1 ${name}`);
  wrangler(["d1", "create", name]);
}

const r2Listing = wrangler(["r2", "bucket", "list"], true).split(/\s+/);
for (const name of missing(desired.r2, r2Listing)) {
  console.log(`create R2 bucket ${name}`);
  wrangler(["r2", "bucket", "create", name]);
}

const queuesBefore = wranglerJson<{ queue_name?: string; name?: string }[]>(["queues", "list"]);
const queueNames = queuesBefore.map((q) => q.queue_name ?? q.name ?? "");
for (const name of missing(desired.queues, queueNames)) {
  console.log(`create queue ${name}`);
  wrangler(["queues", "create", name]);
}

const d1After = wranglerJson<{ name: string; uuid: string }[]>(["d1", "list"]);
for (const db of desired.d1) {
  const row = d1After.find((d) => d.name === db.name);
  console.log(`paste into wrangler.jsonc: ${db.binding} (${db.name}) database_id = ${row?.uuid ?? "NOT FOUND"}`);
}
