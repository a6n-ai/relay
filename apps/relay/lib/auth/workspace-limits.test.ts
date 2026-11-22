import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyStaffWorkspaceLimits, canCreateSelfServeWorkspace } from "./workspace-limits";

const { set, where, update } = vi.hoisted(() => {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { set, where, update };
});
vi.mock("@/db/client", () => ({ db: { update } }));

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

describe("applyStaffWorkspaceLimits", () => {
  beforeEach(() => {
    update.mockClear();
    set.mockClear();
    where.mockClear();
  });

  it("makes a super admin workspace unlimited and not self-serve", async () => {
    await applyStaffWorkspaceLimits("org_2", "super_admin");
    expect(update).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({ maxApps: 0, monthlyMessageQuota: 0, selfServe: false });
    expect(where).toHaveBeenCalledOnce();
  });

  it("leaves a self-made workspace on the column defaults", async () => {
    await applyStaffWorkspaceLimits("org_1", null);
    await applyStaffWorkspaceLimits("org_3", "");
    expect(update).not.toHaveBeenCalled();
  });
});
