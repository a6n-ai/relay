import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@foundry/commons";

const state = vi.hoisted(() => ({
  activeOrgId: null as string | null,
  orgRows: [] as { id: string; slug: string }[],
  listRecent: vi.fn(),
}));

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));

vi.mock("@/lib/auth/active-org", () => ({
  getActiveOrganizationId: async () => state.activeOrgId,
}));

vi.mock("@/lib/services/tenants.service", () => ({
  tenantsService: { listRecent: (...args: unknown[]) => state.listRecent(...args) },
}));

vi.mock("@/db/client", () => {
  const select = () => ({
    from: () => ({
      where: () => ({
        limit: async () => state.orgRows,
      }),
    }),
  });
  return { db: { select } };
});

import { inScope, mailboxScope, PLATFORM_WORKSPACE_SLUG, platformWorkspaceId, workspaceSlug } from "./scope";

describe("mailboxScope", () => {
  beforeEach(() => {
    state.activeOrgId = null;
    state.orgRows = [];
    state.listRecent.mockReset();
  });

  it("throws NotFoundError when no workspace is active", async () => {
    await expect(mailboxScope()).rejects.toBeInstanceOf(NotFoundError);
    expect(state.listRecent).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the active workspace row is missing", async () => {
    state.activeOrgId = "org_gone";
    await expect(mailboxScope()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("scopes to the client workspace's tenants without operator mail", async () => {
    state.activeOrgId = "org_client";
    state.orgRows = [{ id: "org_client", slug: "acme" }];
    state.listRecent.mockResolvedValue({ items: [{ id: 7n }, { id: 9n }] });

    await expect(mailboxScope()).resolves.toEqual({
      organizationId: "org_client",
      tenantIds: [7n, 9n],
      includeOperatorMail: false,
    });
    expect(state.listRecent).toHaveBeenCalledWith(undefined, 1000);
  });

  it("includes operator mail in the platform workspace", async () => {
    state.activeOrgId = "org_a6n";
    state.orgRows = [{ id: "org_a6n", slug: PLATFORM_WORKSPACE_SLUG }];
    state.listRecent.mockResolvedValue({ items: [] });

    await expect(mailboxScope()).resolves.toEqual({
      organizationId: "org_a6n",
      tenantIds: [],
      includeOperatorMail: true,
    });
  });
});

describe("workspaceSlug and platformWorkspaceId", () => {
  beforeEach(() => {
    state.activeOrgId = null;
    state.orgRows = [];
  });

  it("returns null without an active workspace", async () => {
    await expect(workspaceSlug()).resolves.toBeNull();
  });

  it("returns the active workspace id and slug", async () => {
    state.activeOrgId = "org_1";
    state.orgRows = [{ id: "org_1", slug: "acme" }];
    await expect(workspaceSlug()).resolves.toEqual({ id: "org_1", slug: "acme" });
  });

  it("returns the platform workspace id, or null when absent", async () => {
    state.orgRows = [{ id: "org_a6n", slug: PLATFORM_WORKSPACE_SLUG }];
    await expect(platformWorkspaceId()).resolves.toBe("org_a6n");
    state.orgRows = [];
    await expect(platformWorkspaceId()).resolves.toBeNull();
  });
});

describe("inScope", () => {
  const tenantScope = { organizationId: "org_client", tenantIds: [7n], includeOperatorMail: false };
  const platformScope = { organizationId: "org_a6n", tenantIds: [7n], includeOperatorMail: true };

  it("admits rows whose tenant is in the scope", () => {
    expect(inScope({ tenantId: 7n }, tenantScope)).toBe(true);
  });

  it("rejects rows from another tenant", () => {
    expect(inScope({ tenantId: 8n }, tenantScope)).toBe(false);
  });

  it("rejects operator mail outside the platform workspace", () => {
    expect(inScope({ tenantId: null }, tenantScope)).toBe(false);
  });

  it("admits operator mail inside the platform workspace", () => {
    expect(inScope({ tenantId: null }, platformScope)).toBe(true);
  });
});
