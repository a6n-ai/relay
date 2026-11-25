// Pure: no Node or Workers imports, so the vitest workers pool can load it.
export const SWEEP_URL = "https://relay.a6n.ai/api/internal/do-sweep";

export type DeployStep =
  | { name: string; kind: "wrangler"; args: string[] }
  | { name: string; kind: "sweep" };

// Order is the contract: every D1 migration lands before the Worker that needs it; the DO sweep runs after the deploy.
export function deployPlan(d1Names: string[]): DeployStep[] {
  return [
    ...d1Names.map((db): DeployStep => ({
      name: `migrate ${db}`,
      kind: "wrangler",
      args: ["d1", "migrations", "apply", db, "--remote"],
    })),
    { name: "deploy worker", kind: "wrangler", args: ["deploy"] },
    { name: "do-sweep", kind: "sweep" },
  ];
}

export function describeStep(step: DeployStep): string {
  return step.kind === "wrangler" ? `wrangler ${step.args.join(" ")}` : `POST ${SWEEP_URL}`;
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
