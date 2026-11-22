import { describe, expect, it } from "vitest";
import { canCreateSelfServeWorkspace, selfServeLimits } from "./workspace-limits";

describe("selfServeLimits", () => {
  it("self-made workspaces get 1 app and 100 sends", () => {
    expect(selfServeLimits(null)).toEqual({ maxApps: 1, monthlyMessageQuota: 100 });
    expect(selfServeLimits("")).toEqual({ maxApps: 1, monthlyMessageQuota: 100 });
  });

  it("super admin workspaces keep defaults", () => {
    expect(selfServeLimits("super_admin")).toBeNull();
  });
});

describe("canCreateSelfServeWorkspace", () => {
  it("allows a third workspace", () => {
    expect(canCreateSelfServeWorkspace(null, 2)).toBe(true);
  });

  it("refuses a fourth workspace", () => {
    expect(canCreateSelfServeWorkspace(null, 3)).toBe(false);
  });

  it("super admin has no cap", () => {
    expect(canCreateSelfServeWorkspace("super_admin", 50)).toBe(true);
  });
});
