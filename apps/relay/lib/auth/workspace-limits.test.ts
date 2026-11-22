import { describe, expect, it } from "vitest";
import { selfServeLimits } from "./workspace-limits";

describe("selfServeLimits", () => {
  it("self-made workspaces get 1 app and 100 sends", () => {
    expect(selfServeLimits(null)).toEqual({ maxApps: 1, monthlyMessageQuota: 100 });
    expect(selfServeLimits("")).toEqual({ maxApps: 1, monthlyMessageQuota: 100 });
  });

  it("super admin workspaces keep defaults", () => {
    expect(selfServeLimits("super_admin")).toBeNull();
  });
});
