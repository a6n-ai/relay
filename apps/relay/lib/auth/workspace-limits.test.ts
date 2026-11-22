import { beforeEach, describe, expect, it, vi } from "vitest";
import { applySelfServeLimits, canCreateSelfServeWorkspace, selfServeLimits } from "./workspace-limits";

const { set, where, update } = vi.hoisted(() => {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { set, where, update };
});
vi.mock("@/db/client", () => ({ db: { update } }));

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

describe("applySelfServeLimits", () => {
  beforeEach(() => {
    update.mockClear();
    set.mockClear();
    where.mockClear();
  });

  it("sets limits and selfServe on a self-made workspace", async () => {
    await applySelfServeLimits("org_1", null);
    expect(update).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({ maxApps: 1, monthlyMessageQuota: 100, selfServe: true });
    expect(where).toHaveBeenCalledOnce();
  });

  it("leaves a super admin workspace untouched", async () => {
    await applySelfServeLimits("org_2", "super_admin");
    expect(update).not.toHaveBeenCalled();
  });
});
