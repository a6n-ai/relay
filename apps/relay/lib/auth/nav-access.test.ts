import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  granted: [] as string[],
  can: vi.fn(async (_perms: Record<string, string[]>) => false),
}));

vi.mock("./guards", () => ({ can: state.can }));

const { navAccess } = await import("./nav-access");
const { permKey, TEAM_PERM } = await import("@/components/ds/nav");

describe("navAccess", () => {
  beforeEach(() => {
    state.can.mockClear();
    state.can.mockImplementation(async (perms) => state.granted.includes(permKey(perms)));
    state.granted = [permKey({ mailbox: ["read"] })];
  });

  it("resolves each distinct nav permission once and returns the granted keys", async () => {
    const allowed = await navAccess();
    expect(state.can).toHaveBeenCalledTimes(7);
    expect(allowed.has(permKey({ mailbox: ["read"] }))).toBe(true);
    expect(allowed.has(permKey({ campaign: ["read"] }))).toBe(false);
    expect(allowed.has(permKey(TEAM_PERM))).toBe(false);
  });
});
