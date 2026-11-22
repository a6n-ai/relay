import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  activeOrgId: null as string | null,
  orgRows: [] as { id: string; slug: string }[],
  listRecent: vi.fn(),
  failures: [] as Record<string, unknown>[],
  deletes: [] as unknown[],
}));
const processQueuedInbound = vi.hoisted(() => vi.fn());

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
vi.mock("@/lib/mailbox/access", () => ({ mailboxAccess: async () => "all", canSeeMailbox: () => true }));
vi.mock("@/lib/auth/active-org", () => ({ getActiveOrganizationId: async () => state.activeOrgId }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "ses_user" } }) }));
vi.mock("@/lib/auth/guards", () => ({ activeMember: async () => ({ organizationId: state.activeOrgId }) }));
vi.mock("@/lib/services/tenants.service", () => ({
  tenantsService: { listRecent: (...args: unknown[]) => state.listRecent(...args) },
}));
vi.mock("@/lib/campaigns/http", () => ({ operatorGuard: async () => {} }));
vi.mock("@/lib/mailbox/process-queued", () => ({ processQueuedInbound }));

vi.mock("@/db/client", async () => {
  const { organization } = await import("@/db/schema");
  const chain = (table: unknown): unknown => {
    const c = {
      innerJoin: () => c,
      where: () => ({ limit: async () => (table === organization ? state.orgRows : state.failures) }),
    };
    return c;
  };
  return {
    db: {
      select: () => ({ from: (table: unknown) => chain(table) }),
      delete: (table: unknown) => ({
        where: async () => {
          state.deletes.push(table);
        },
      }),
    },
  };
});

const { POST } = await import("./route");
const { mailboxInboundFailure } = await import("@/db/schema");

const RECEIVED = Date.UTC(2026, 10, 10, 9);

function failure(overrides: Record<string, unknown>) {
  return {
    id: 1n,
    publicId: "mif_a",
    rawKey: "mail/in/2026/11/raw1.eml",
    envelopeFrom: "bounce@out.test",
    envelopeTo: "hello@acme.test",
    authResults: "dmarc=pass",
    receivedAt: RECEIVED,
    organizationId: "org_a",
    ...overrides,
  };
}

function retry(id: string) {
  return POST(new Request(`http://localhost/api/mailbox/failures/${id}/retry`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

function signInTo(orgId: string, slug: string) {
  state.activeOrgId = orgId;
  state.orgRows = [{ id: orgId, slug }];
  state.listRecent.mockResolvedValue({ items: [] });
}

describe("POST /api/mailbox/failures/[id]/retry", () => {
  beforeEach(() => {
    state.activeOrgId = null;
    state.orgRows = [];
    state.listRecent.mockReset();
    state.failures = [failure({})];
    state.deletes.length = 0;
    processQueuedInbound.mockReset();
  });

  it("rebuilds the queued message from the failure row and calls processQueuedInbound once", async () => {
    processQueuedInbound.mockResolvedValue({ outcome: "inserted" });
    signInTo("org_a", "acme");

    const res = await retry("mif_a");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "inserted" });
    expect(processQueuedInbound).toHaveBeenCalledTimes(1);
    expect(processQueuedInbound).toHaveBeenCalledWith({
      rawId: "raw1",
      rawKey: "mail/in/2026/11/raw1.eml",
      envelopeFrom: "bounce@out.test",
      envelopeTo: "hello@acme.test",
      authResults: "dmarc=pass",
      receivedAt: RECEIVED,
    });
  });

  it("deletes the failure row after a successful outcome", async () => {
    processQueuedInbound.mockResolvedValue({ outcome: "duplicate" });
    signInTo("org_a", "acme");
    await retry("mif_a");
    expect(state.deletes).toEqual([mailboxInboundFailure]);
  });

  it("keeps the failure row when the retry fails again", async () => {
    processQueuedInbound.mockResolvedValue({ outcome: "failed" });
    signInTo("org_a", "acme");

    const res = await retry("mif_a");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "failed" });
    expect(state.deletes).toEqual([]);
  });

  it("answers 404 and does not retry a failure in another workspace", async () => {
    state.failures = [failure({ organizationId: "org_b" })];
    signInTo("org_a", "acme");

    expect((await retry("mif_a")).status).toBe(404);
    expect(processQueuedInbound).not.toHaveBeenCalled();
  });

  it("answers 404 for operator mail outside the platform workspace", async () => {
    state.failures = [failure({ organizationId: null })];
    signInTo("org_a", "acme");

    expect((await retry("mif_a")).status).toBe(404);
    expect(processQueuedInbound).not.toHaveBeenCalled();
  });
});
