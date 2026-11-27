// Pure: no Node or Workers imports, so the vitest workers pool can load it.
export const DEFAULT_BASE_URL = "https://relay.a6n.ai";

export type DeployStep =
  | { name: string; kind: "build" }
  | { name: string; kind: "wrangler"; args: string[] }
  | { name: string; kind: "sweep"; url: string };

// RELAY_URL points the sweep at the Worker just deployed.
export function sweepUrl(base: string | undefined): string {
  const origin = new URL(base?.trim() || DEFAULT_BASE_URL);
  if (origin.protocol !== "https:") throw new Error("RELAY_URL must be an https URL");
  return `${origin.origin}/api/internal/do-sweep`;
}

// Order is the contract: the build comes first so a failed build stops before D1 is touched; every D1 migration lands
// before the Worker that needs it; the DO sweep runs after the deploy.
export function deployPlan(d1Names: string[], baseUrl?: string): DeployStep[] {
  return [
    { name: "build", kind: "build" },
    ...d1Names.map((db): DeployStep => ({
      name: `migrate ${db}`,
      kind: "wrangler",
      args: ["d1", "migrations", "apply", db, "--remote"],
    })),
    { name: "deploy worker", kind: "wrangler", args: ["deploy"] },
    { name: "do-sweep", kind: "sweep", url: sweepUrl(baseUrl) },
  ];
}

export function describeStep(step: DeployStep): string {
  if (step.kind === "build") return "vite build";
  return step.kind === "wrangler" ? `wrangler ${step.args.join(" ")}` : `POST ${step.url}`;
}

// A throwing exec stops the run: later steps never start.
export async function runPlan(
  steps: DeployStep[],
  exec: (step: DeployStep) => Promise<void>,
  log: (line: string) => void,
): Promise<void> {
  for (const step of steps) {
    log(`start ${step.name}`);
    await exec(step);
    log(`done ${step.name}`);
  }
}
