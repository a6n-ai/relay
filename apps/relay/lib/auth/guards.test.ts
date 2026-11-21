import { beforeEach, describe, expect, it, vi } from "vitest";

const fresh = vi.fn(async () => null);
const cached = vi.fn(async () => null);
vi.mock("./session", () => ({ getFreshSession: () => fresh(), getSession: () => cached() }));

const { requireAdmin } = await import("./guards");
const { operatorGuard } = await import("@/lib/campaigns/http");

describe("mutation guards", () => {
  it.each([
    ["requireAdmin", () => requireAdmin()],
    ["operatorGuard", () => operatorGuard()],
  ])("%s checks the live session, never the cookie cache", async (_n, guard) => {
    fresh.mockClear();
    cached.mockClear();
    await guard().catch(() => {});
    expect(fresh).toHaveBeenCalled();
    expect(cached).not.toHaveBeenCalled();
  });
});

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasPermission: vi.fn(),
  memberRows: [] as { id: string; organizationId: string; role: string; status: string }[],
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("./index", () => ({ auth: { api: { getSession: h.getSession, hasPermission: h.hasPermission } } }));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => h.memberRows }) }) }) },
}));

const { requirePermission, can, requirePagePermission } = await import("./guards");
const { ForbiddenError } = await import("@foundry/commons");

const activeMember = { id: "m1", organizationId: "org1", role: "admin", status: "active" };

describe("org permission check", () => {
  beforeEach(() => {
    h.getSession.mockReset().mockResolvedValue({ user: { id: "7" }, session: { activeOrganizationId: "org1" } });
    h.hasPermission.mockReset().mockResolvedValue({ success: true });
    h.memberRows = [activeMember];
  });

  it("rejects a suspended member without asking better-auth", async () => {
    h.memberRows = [{ ...activeMember, status: "suspended" }];
    await expect(requirePermission({ tenant: ["read"] })).rejects.toBeInstanceOf(ForbiddenError);
    expect(h.hasPermission).not.toHaveBeenCalled();
  });

  it("rejects when hasPermission refuses", async () => {
    h.hasPermission.mockResolvedValue({ success: false });
    await expect(requirePermission({ tenant: ["write"] })).rejects.toBeInstanceOf(ForbiddenError);
    expect(h.hasPermission).toHaveBeenCalledWith(expect.objectContaining({ body: { permissions: { tenant: ["write"] } } }));
  });

  it("passes when hasPermission succeeds", async () => {
    await expect(requirePermission({ tenant: ["write"] })).resolves.toBeUndefined();
  });

  it("can returns false without a member row or active workspace", async () => {
    h.memberRows = [];
    expect(await can({ tenant: ["read"] })).toBe(false);
    h.memberRows = [activeMember];
    h.getSession.mockResolvedValue({ user: { id: "7" }, session: { activeOrganizationId: null } });
    expect(await can({ tenant: ["read"] })).toBe(false);
  });

  it("requirePagePermission hides the page with notFound on refusal", async () => {
    h.hasPermission.mockResolvedValue({ success: false });
    await expect(requirePagePermission({ staff: ["read"] })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
