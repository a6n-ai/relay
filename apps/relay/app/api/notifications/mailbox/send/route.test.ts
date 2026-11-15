import { beforeEach, describe, expect, it, vi } from "vitest";

type Letter = {
  publicId: string;
  tenantId: bigint | null;
  rfcMessageId: string;
  threadId: string;
  rfcReferences: string | null;
};
type Sender = { publicId: string; tenantId: bigint; email: string; displayName: string | null; verifiedAt: number | null };

const state = vi.hoisted(() => ({
  activeOrgId: null as string | null,
  orgRows: [] as { id: string; slug: string }[],
  listRecent: vi.fn(),
  letters: [] as Letter[],
  senders: [] as Sender[],
  archived: [] as { tenantId: bigint | null; fromEmail: string }[],
  sent: [] as unknown[],
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

vi.mock("@/lib/email/from-address", () => ({
  operatorDefaultFrom: async () => ({ email: "ops@a6n.test", name: "a6n" }),
}));

vi.mock("@/lib/email/provider", () => ({
  hydrateSmtpFromDb: async () => {},
  getEmailProvider: () => ({ send: async (msg: unknown) => void state.sent.push(msg) }),
}));

vi.mock("@/lib/services/email-senders.service", () => ({
  emailSendersService: {
    read: async (publicId: string) => state.senders.find((s) => s.publicId === publicId) ?? null,
  },
}));

vi.mock("@/lib/mailbox/list", () => ({
  readMailboxLetter: async (scope: import("@/lib/mailbox/scope").MailboxScope, publicId: string) => {
    const { inScope } = await import("@/lib/mailbox/scope");
    return state.letters.find((l) => l.publicId === publicId && inScope(l, scope)) ?? null;
  },
}));

vi.mock("@relay/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@relay/engine")>()),
  archiveMailboxLetter: async (_db: unknown, _tables: unknown, letter: { tenantId: bigint | null; fromEmail: string }) => {
    state.archived.push({ tenantId: letter.tenantId, fromEmail: letter.fromEmail });
  },
}));

import { PLATFORM_WORKSPACE_SLUG } from "@/lib/mailbox/scope";
const { POST } = await import("./route");

const CLIENT_A = 7n;
const CLIENT_B = 9n;

function send(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/notifications/mailbox/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "buyer@example.test", subject: "Hi", text: "Hello", ...body }),
    }),
  );
}

function signInTo(orgId: string, slug: string, tenantIds: bigint[]) {
  state.activeOrgId = orgId;
  state.orgRows = [{ id: orgId, slug }];
  state.listRecent.mockResolvedValue({ items: tenantIds.map((id) => ({ id })) });
}

describe("POST /api/notifications/mailbox/send", () => {
  beforeEach(() => {
    state.activeOrgId = null;
    state.orgRows = [];
    state.listRecent.mockReset();
    state.archived = [];
    state.sent = [];
    state.letters = [
      { publicId: "eml_a", tenantId: CLIENT_A, rfcMessageId: "<a@x>", threadId: "<a@x>", rfcReferences: null },
      { publicId: "eml_b", tenantId: CLIENT_B, rfcMessageId: "<b@x>", threadId: "<b@x>", rfcReferences: null },
    ];
    state.senders = [
      { publicId: "ues_a", tenantId: CLIENT_A, email: "hi@acme.test", displayName: "Acme", verifiedAt: 1 },
      { publicId: "ues_b", tenantId: CLIENT_B, email: "hi@bravo.test", displayName: "Bravo", verifiedAt: 1 },
    ];
  });

  it("answers 404 for the operator From outside the platform workspace", async () => {
    signInTo("org_a", "acme", [CLIENT_A]);
    const res = await send({ fromId: "operator" });
    expect(res.status).toBe(404);
    expect(state.sent).toHaveLength(0);
  });

  it("answers 404 for a sender whose app is outside the workspace", async () => {
    signInTo("org_a", "acme", [CLIENT_A]);
    const res = await send({ fromId: "ues_b" });
    expect(res.status).toBe(404);
    expect(state.sent).toHaveLength(0);
  });

  it("answers 404 for an unknown sender, the same as one outside the workspace", async () => {
    signInTo("org_a", "acme", [CLIENT_A]);
    const res = await send({ fromId: "ues_missing" });
    expect(res.status).toBe(404);
    expect(state.sent).toHaveLength(0);
  });

  it("answers 404 for a reply parent outside the workspace", async () => {
    signInTo("org_a", "acme", [CLIENT_A]);
    const res = await send({ fromId: "ues_a", replyToId: "eml_b" });
    expect(res.status).toBe(404);
    expect(state.sent).toHaveLength(0);
  });

  it("stores a reply with the parent thread's tenant", async () => {
    signInTo("org_a6n", PLATFORM_WORKSPACE_SLUG, [CLIENT_A, CLIENT_B]);
    const res = await send({ fromId: "ues_a", replyToId: "eml_b" });
    expect(res.status).toBe(200);
    expect(state.archived).toEqual([{ tenantId: CLIENT_B, fromEmail: "hi@acme.test" }]);
  });

  it("stores an a6n operator reply into a client thread under the client's tenant", async () => {
    signInTo("org_a6n", PLATFORM_WORKSPACE_SLUG, [CLIENT_A, CLIENT_B]);
    const res = await send({ fromId: "operator", replyToId: "eml_a" });
    expect(res.status).toBe(200);
    expect(state.archived).toEqual([{ tenantId: CLIENT_A, fromEmail: "ops@a6n.test" }]);
  });
});
