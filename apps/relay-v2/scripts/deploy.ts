// Migrates both D1 databases, deploys the Worker, then runs the DO sweep. Dry-run unless --apply.
import { readFileSync } from "node:fs";
import { wrangler, WRANGLER_CONFIG } from "./lib/run.ts";
import { describeStep, deployPlan, runPlan, SWEEP_URL } from "./lib/deploy-plan.ts";
import { parseWranglerJsonc } from "./lib/wrangler-config.ts";

const apply = process.argv.includes("--apply");
const d1Names = parseWranglerJsonc(readFileSync(WRANGLER_CONFIG, "utf8")).d1.map((d) => d.name);
const steps = deployPlan(d1Names);

if (!apply) {
  for (const step of steps) console.log(`plan: ${describeStep(step)}`);
  console.log("dry-run: nothing executed. Re-run with --apply to deploy.");
  process.exit(0);
}

const secret = process.env.INTERNAL_SECRET;
if (!secret) throw new Error("INTERNAL_SECRET is not set; refusing to start any deploy step");

await runPlan(
  steps,
  async (step) => {
    if (step.kind === "wrangler") {
      wrangler(step.args);
      return;
    }
    const res = await fetch(SWEEP_URL, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    if (!res.ok) throw new Error(`do-sweep failed with HTTP ${res.status}`);
    console.log(`do-sweep: HTTP ${res.status}`);
  },
  console.log,
);
