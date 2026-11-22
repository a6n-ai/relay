import { beforeEach, describe, expect, it, vi } from "vitest";

type Letter = { publicId: string; tenantId: bigint | null; mailboxId: bigint | null };

const state = vi.hoisted(() => ({
  activeOrgId: null as string | null,
  orgRows: [] as { id: string; slug: string }[],
  listRecent: vi.fn(),
  letters: [] as Letter[],
  access: "all" as "all" | bigint[],
}));

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));

vi.mock("@/lib/mailbox/access", () => ({
  mailboxAccess: async () => state.access,
  canSeeMailbox: (access: "all" | bigint[], mailboxId: bigint | null) =>
    access === "all" || (mailboxId !== null && access.includes(mailboxId)),
}));

vi.mock("@/lib/auth/active-org", () => ({
  getActiveOrganizationId: async () => state.activeOrgId,
}));

vi.mock("@/lib/services/tenants.service", () => ({
  tenantsService: { listRecent: (...args: unknown[]) => state.listRecent(...args) },
}));

vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "ses_user" } }) }));
vi.mock("@/lib/auth/guards", () => ({ activeMember: async () => ({ organizationId: state.activeOrgId }) }));

vi.mock("@/db/client", () => {
  const chain = (): unknown => ({
    innerJoin: () => chain(),
    where: () => ({ limit: async () => state.orgRows }),
  });
  return { db: { select: () => ({ from: () => chain() }) } };
});

vi.mock("@/lib/campaigns/http", () => ({ operatorGuard: async () => {} }));

vi.mock("@/lib/mailbox/list", () => ({
  listMailboxLetters: async (scope: import("@/lib/mailbox/scope").MailboxScope) => {
    const { inScope } = await import("@/lib/mailbox/scope");
    return state.letters.filter((l) => inScope(l, scope));
  },
}));

import { PLATFORM_WORKSPACE_SLUG } from "@/lib/mailbox/scope";
const { GET } = await import("./route");

const CLIENT_A = 7n;
const CLIENT_B = 9n;

describe("GET /api/notifications/mailbox", () => {
  beforeEach(() => {
    state.activeOrgId = null;
    state.orgRows = [];
    state.listRecent.mockReset();
    state.access = "all";
    state.letters = [
      { publicId: "eml_a", tenantId: CLIENT_A, mailboxId: 11n },
      { publicId: "eml_b", tenantId: CLIENT_B, mailboxId: 12n },
      { publicId: "eml_operator", tenantId: null, mailboxId: null },
    ];
  });

  it("lists a member only the letters of granted mailboxes", async () => {
    state.activeOrgId = "org_a";
    state.orgRows = [{ id: "org_a", slug: "acme" }];
    state.listRecent.mockResolvedValue({ items: [{ id: CLIENT_A }, { id: CLIENT_B }] });
    state.access = [12n];
    const body = await (await GET()).json();
    expect(body.map((l: { publicId: string }) => l.publicId)).toEqual(["eml_b"]);
  });

  it("answers 404, not a redirect, with no active workspace", async () => {
    const res = await GET();
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(307);
  });

  it("lists only the active workspace's letters", async () => {
    state.activeOrgId = "org_a";
    state.orgRows = [{ id: "org_a", slug: "acme" }];
    state.listRecent.mockResolvedValue({ items: [{ id: CLIENT_A }] });
    const body = await (await GET()).json();
    expect(body.map((l: { publicId: string }) => l.publicId)).toEqual(["eml_a"]);
  });

  it("hides operator mail outside the platform workspace", async () => {
    state.activeOrgId = "org_a";
    state.orgRows = [{ id: "org_a", slug: "acme" }];
    state.listRecent.mockResolvedValue({ items: [{ id: CLIENT_A }] });
    const body = await (await GET()).json();
    expect(body.map((l: { publicId: string }) => l.publicId)).not.toContain("eml_operator");
  });

  it("shows operator mail inside the platform workspace", async () => {
    state.activeOrgId = "org_a6n";
    state.orgRows = [{ id: "org_a6n", slug: PLATFORM_WORKSPACE_SLUG }];
    state.listRecent.mockResolvedValue({ items: [{ id: CLIENT_A }] });
    const body = await (await GET()).json();
    expect(body.map((l: { publicId: string }) => l.publicId)).toContain("eml_operator");
  });
});
