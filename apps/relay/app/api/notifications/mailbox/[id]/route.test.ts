import { beforeEach, describe, expect, it, vi } from "vitest";

type Letter = { publicId: string; tenantId: bigint | null };

const state = vi.hoisted(() => ({
  activeOrgId: null as string | null,
  orgRows: [] as { id: string; slug: string }[],
  listRecent: vi.fn(),
  letters: [] as Letter[],
}));

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));

vi.mock("@/lib/auth/active-org", () => ({
  getActiveOrganizationId: async () => state.activeOrgId,
}));

vi.mock("@/lib/services/tenants.service", () => ({
  tenantsService: { listRecent: (...args: unknown[]) => state.listRecent(...args) },
}));

vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "ses_user" } }) }));

vi.mock("@/db/client", () => {
  const chain = (): unknown => ({
    innerJoin: () => chain(),
    where: () => ({ limit: async () => state.orgRows }),
  });
  return { db: { select: () => ({ from: () => chain() }) } };
});

vi.mock("@/lib/campaigns/http", () => ({ operatorGuard: async () => {} }));

vi.mock("@/lib/mailbox/list", () => ({
  readMailboxLetter: async (scope: import("@/lib/mailbox/scope").MailboxScope, publicId: string) => {
    const { inScope } = await import("@/lib/mailbox/scope");
    return state.letters.find((l) => l.publicId === publicId && inScope(l, scope)) ?? null;
  },
}));

import { PLATFORM_WORKSPACE_SLUG } from "@/lib/mailbox/scope";
const { GET } = await import("./route");

const CLIENT_A = 7n;
const CLIENT_B = 9n;

function read(id: string) {
  return GET(new Request(`http://localhost/api/notifications/mailbox/${id}`), {
    params: Promise.resolve({ id }),
  });
}

function signInTo(orgId: string, slug: string, tenantIds: bigint[]) {
  state.activeOrgId = orgId;
  state.orgRows = [{ id: orgId, slug }];
  state.listRecent.mockResolvedValue({ items: tenantIds.map((id) => ({ id })) });
}

describe("GET /api/notifications/mailbox/[id]", () => {
  beforeEach(() => {
    state.activeOrgId = null;
    state.orgRows = [];
    state.listRecent.mockReset();
    state.letters = [
      { publicId: "eml_a", tenantId: CLIENT_A },
      { publicId: "eml_b", tenantId: CLIENT_B },
      { publicId: "eml_operator", tenantId: null },
    ];
  });

  it("answers 404, not a redirect, with no active workspace", async () => {
    const res = await read("eml_a");
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(307);
  });

  it("returns the workspace's own letter", async () => {
    signInTo("org_a", "acme", [CLIENT_A]);
    const res = await read("eml_a");
    expect(res.status).toBe(200);
    expect((await res.json()).publicId).toBe("eml_a");
  });

  it("answers 404 for another workspace's letter", async () => {
    signInTo("org_a", "acme", [CLIENT_A]);
    expect((await read("eml_b")).status).toBe(404);
  });

  it("answers 404 for operator mail outside the platform workspace", async () => {
    signInTo("org_a", "acme", [CLIENT_A]);
    expect((await read("eml_operator")).status).toBe(404);
  });

  it("returns operator mail inside the platform workspace", async () => {
    signInTo("org_a6n", PLATFORM_WORKSPACE_SLUG, [CLIENT_A]);
    expect((await read("eml_operator")).status).toBe(200);
  });
});
