import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@foundry/commons";

const state = vi.hoisted(() => ({
  activeOrgId: null as string | null,
  orgRows: [] as { id: string; slug: string }[],
  listRecent: vi.fn(),
  access: "all" as "all" | bigint[],
  member: null as { organizationId: string } | null,
  requireOrg: vi.fn(async () => {
    throw new Error("NEXT_REDIRECT /dashboard/workspaces");
  }),
}));

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));

vi.mock("./access", () => ({
  mailboxAccess: async () => state.access,
  canSeeMailbox: (access: "all" | bigint[], mailboxId: bigint | null) =>
    access === "all" || (mailboxId !== null && access.includes(mailboxId)),
}));

vi.mock("@/lib/auth/active-org", () => ({
  getActiveOrganizationId: async () => state.activeOrgId,
  requireActiveOrganizationId: (...args: unknown[]) => state.requireOrg(...(args as [])),
}));

vi.mock("@/lib/auth/guards", () => ({
  activeMember: async () =>
    state.member ?? (state.activeOrgId ? { organizationId: state.activeOrgId } : null),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ user: { id: "ses_user" } }),
}));

vi.mock("@/lib/services/tenants.service", () => ({
  tenantsService: { listRecent: (...args: unknown[]) => state.listRecent(...args) },
}));

vi.mock("@/db/client", () => {
  const chain = (): unknown => ({
    innerJoin: () => chain(),
    where: () => ({ limit: async () => state.orgRows }),
  });
  return { db: { select: () => ({ from: () => chain() }) } };
});

import { inScope, mailboxScope, PLATFORM_WORKSPACE_SLUG, platformWorkspaceId, workspaceSlug } from "./scope";

describe("mailboxScope", () => {
  beforeEach(() => {
    state.activeOrgId = null;
    state.orgRows = [];
    state.listRecent.mockReset();
    state.requireOrg.mockClear();
    state.access = "all";
    state.member = null;
  });

  it("mismatched workspace gets no mailbox access", async () => {
    state.activeOrgId = "org_client";
    state.orgRows = [{ id: "org_client", slug: "acme" }];
    state.listRecent.mockResolvedValue({ items: [{ id: 7n }] });
    state.member = { organizationId: "org_other" };

    await expect(mailboxScope()).resolves.toMatchObject({ organizationId: "org_client", mailboxIds: [] });
  });

  it("pages redirect to the workspace picker when no workspace is active", async () => {
    await expect(mailboxScope({ onMissing: "redirect" })).rejects.toThrow("/dashboard/workspaces");
    expect(state.requireOrg).toHaveBeenCalledTimes(1);
    await expect(mailboxScope()).rejects.toBeInstanceOf(NotFoundError);
    expect(state.requireOrg).toHaveBeenCalledTimes(1);
  });

  it("reads the caller's mailbox grants on every call", async () => {
    state.activeOrgId = "org_client";
    state.orgRows = [{ id: "org_client", slug: "acme" }];
    state.listRecent.mockResolvedValue({ items: [{ id: 7n }] });

    state.access = [11n];
    await expect(mailboxScope()).resolves.toMatchObject({ mailboxIds: [11n] });
    state.access = "all";
    await expect(mailboxScope()).resolves.toMatchObject({ mailboxIds: "all" });
  });

  it("throws NotFoundError when no workspace is active", async () => {
    await expect(mailboxScope()).rejects.toBeInstanceOf(NotFoundError);
    expect(state.listRecent).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the active workspace row is missing", async () => {
    state.activeOrgId = "org_gone";
    await expect(mailboxScope()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError when the session user has no member row in the active workspace", async () => {
    state.activeOrgId = "org_removed";
    state.orgRows = [];
    await expect(mailboxScope()).rejects.toBeInstanceOf(NotFoundError);
    expect(state.listRecent).not.toHaveBeenCalled();
  });

  it("scopes to the client workspace's tenants without operator mail", async () => {
    state.activeOrgId = "org_client";
    state.orgRows = [{ id: "org_client", slug: "acme" }];
    state.listRecent.mockResolvedValue({ items: [{ id: 7n }, { id: 9n }] });

    await expect(mailboxScope()).resolves.toEqual({
      organizationId: "org_client",
      tenantIds: [7n, 9n],
      includeOperatorMail: false,
      mailboxIds: "all",
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
      mailboxIds: "all",
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
  const tenantScope = { organizationId: "org_client", tenantIds: [7n], includeOperatorMail: false, mailboxIds: "all" as const };
  const platformScope = { organizationId: "org_a6n", tenantIds: [7n], includeOperatorMail: true, mailboxIds: "all" as const };
  const memberScope = { ...tenantScope, mailboxIds: [11n] };

  it("admits rows whose tenant is in the scope", () => {
    expect(inScope({ tenantId: 7n, mailboxId: null }, tenantScope)).toBe(true);
  });

  it("rejects rows from another tenant", () => {
    expect(inScope({ tenantId: 8n, mailboxId: null }, tenantScope)).toBe(false);
  });

  it("rejects operator mail outside the platform workspace", () => {
    expect(inScope({ tenantId: null, mailboxId: null }, tenantScope)).toBe(false);
  });

  it("admits operator mail inside the platform workspace", () => {
    expect(inScope({ tenantId: null, mailboxId: null }, platformScope)).toBe(true);
  });

  it("rejects another workspace's tenant inside the platform workspace", () => {
    expect(inScope({ tenantId: 8n, mailboxId: null }, platformScope)).toBe(false);
  });

  it("admits a member only the letters of a granted mailbox", () => {
    expect(inScope({ tenantId: 7n, mailboxId: 11n }, memberScope)).toBe(true);
    expect(inScope({ tenantId: 7n, mailboxId: 12n }, memberScope)).toBe(false);
    expect(inScope({ tenantId: 7n, mailboxId: null }, memberScope)).toBe(false);
  });
});
