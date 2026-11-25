import { describe, expect, it } from "vitest";
import { deployPlan, type DeployStep, runPlan } from "./deploy-plan.ts";

const plan = deployPlan(["relay-security", "relay-core"]);
const names = plan.map((s) => s.name);

describe("deployPlan", () => {
  it("migrates every D1 before the deploy, and sweeps after it", () => {
    expect(names).toEqual(["migrate relay-security", "migrate relay-core", "deploy worker", "do-sweep"]);
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
    expect(called).toEqual(["migrate relay-security", "migrate relay-core"]);
  });
});
