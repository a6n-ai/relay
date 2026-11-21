import { AuthError } from "@foundry/commons";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  requirePermission: vi.fn(async (_perms: Record<string, string[]>) => {}),
}));

vi.mock("@/lib/auth/session", () => ({ getFreshSession: async () => state.session }));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: state.requirePermission }));

const { operatorGuard } = await import("./http");

describe("operatorGuard", () => {
  beforeEach(() => {
    state.session = null;
    state.requirePermission.mockClear();
  });

  it("rejects without session", async () => {
    await expect(operatorGuard({ campaign: ["send"] })).rejects.toBeInstanceOf(AuthError);
    expect(state.requirePermission).not.toHaveBeenCalled();
  });

  it("passes perms to requirePermission", async () => {
    state.session = { user: { id: "1" } };
    await operatorGuard({ campaign: ["send"] });
    expect(state.requirePermission).toHaveBeenCalledWith({ campaign: ["send"] });
  });
});
