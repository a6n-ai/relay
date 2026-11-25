import { describe, expect, it } from "vitest";
import { deployPlan, type DeployStep, runPlan, sweepUrl } from "./deploy-plan.ts";

const plan = deployPlan(["relay-security", "relay-core"]);
const names = plan.map((s) => s.name);

describe("deployPlan", () => {
  it("builds first, migrates every D1 before the deploy, and sweeps after it", () => {
    expect(names).toEqual(["build", "migrate relay-security", "migrate relay-core", "deploy worker", "do-sweep"]);
  });

  it("sweeps the host from RELAY_V2_URL, defaulting to relay.a6n.ai", () => {
    expect(deployPlan(["d"], "https://relay-v2.acct.workers.dev/").at(-1)).toMatchObject({
      url: "https://relay-v2.acct.workers.dev/api/internal/do-sweep",
    });
    expect(sweepUrl(undefined)).toBe("https://relay.a6n.ai/api/internal/do-sweep");
    expect(() => sweepUrl("http://relay.a6n.ai")).toThrow("https");
  });
});

describe("runPlan", () => {
  it("stops at the first failing step and never runs later ones", async () => {
    const called: string[] = [];
    const exec = async (step: DeployStep) => {
      called.push(step.name);
      if (step.name === "migrate relay-core") throw new Error("migration failed");
    };
    await expect(runPlan(plan, exec, () => {})).rejects.toThrow("migration failed");
    expect(called).toEqual(["build", "migrate relay-security", "migrate relay-core"]);
  });

  it("a failed build touches no D1", async () => {
    const called: string[] = [];
    const exec = async (step: DeployStep) => {
      called.push(step.name);
      if (step.name === "build") throw new Error("build failed");
    };
    await expect(runPlan(plan, exec, () => {})).rejects.toThrow("build failed");
    expect(called).toEqual(["build"]);
  });
});
