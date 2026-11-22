import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  activeRows: [] as { organizationId: string }[],
  setActiveOrganization: vi.fn(),
  listOrganizations: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({ user: { id: "usr_pub" }, session: { activeOrganizationId: null } }),
      listOrganizations: h.listOrganizations,
      setActiveOrganization: h.setActiveOrganization,
    },
  },
}));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => h.activeRows }) }) }) },
}));

const { ensureActiveOrganization } = await import("./ensure-active-org");

describe("ensureActiveOrganization", () => {
  beforeEach(() => {
    h.activeRows = [];
    h.setActiveOrganization.mockReset();
    h.listOrganizations.mockReset().mockResolvedValue([{ id: "org_suspended" }, { id: "org_active" }]);
  });

  it("skips a suspended membership and activates the next active one", async () => {
    h.activeRows = [{ organizationId: "org_active" }];

    await ensureActiveOrganization();

    expect(h.setActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: "org_active" } }),
    );
  });
});
