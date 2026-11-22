import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  activeRows: [] as { organizationId: string }[],
  where: null as unknown,
  setActiveOrganization: vi.fn(),
  listOrganizations: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({ user: { id: "123" }, session: { activeOrganizationId: null } }),
      listOrganizations: h.listOrganizations,
      setActiveOrganization: h.setActiveOrganization,
    },
  },
}));
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async (cond: unknown) => {
          h.where = cond;
          return h.activeRows;
        },
      }),
    }),
  },
}));

const { ensureActiveOrganization } = await import("./ensure-active-org");

describe("ensureActiveOrganization", () => {
  beforeEach(() => {
    h.activeRows = [];
    h.where = null;
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

  it("auto-picks the first active workspace for a fresh login", async () => {
    h.activeRows = [{ organizationId: "org_active" }];

    await ensureActiveOrganization();

    const { params } = new PgDialect().sqlToQuery(h.where as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(params).toContain(123n);
    expect(params).toContain("active");
    expect(h.setActiveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: "org_active" } }),
    );
  });
});
