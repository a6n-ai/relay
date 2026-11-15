import { AuthError } from "@foundry/commons";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  activeOrgId: null as string | null,
  orgRows: [] as { id: string; slug: string }[],
  listRecent: vi.fn(),
  failures: [] as Record<string, unknown>[],
}));
const operatorGuard = vi.hoisted(() => vi.fn());

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
vi.mock("@/lib/auth/active-org", () => ({ getActiveOrganizationId: async () => state.activeOrgId }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "ses_user" } }) }));
vi.mock("@/lib/services/tenants.service", () => ({
  tenantsService: { listRecent: (...args: unknown[]) => state.listRecent(...args) },
}));
vi.mock("@/lib/campaigns/http", () => ({ operatorGuard }));

vi.mock("@/db/client", async () => {
  const { organization } = await import("@/db/schema");
  const chain = (table: unknown): unknown => {
    const c = {
      innerJoin: () => c,
      where: () => ({ limit: async () => (table === organization ? state.orgRows : state.failures) }),
    };
    return c;
  };
  return { db: { select: () => ({ from: (table: unknown) => chain(table) }) } };
});

const { GET } = await import("./route");
const { mailBucket } = await import("@/lib/mailbox/mail-bucket");

const RECEIVED = Date.UTC(2026, 10, 10, 9);
const RAW = new TextEncoder().encode("From: a@b.test\r\nSubject: x\r\n\r\nhi");

function failure(overrides: Record<string, unknown>) {
  return {
    id: 1n,
    publicId: "mif_a",
    rawKey: "mail/in/2026/11/raw1.eml",
    envelopeFrom: "bounce@out.test",
    envelopeTo: "hello@acme.test",
    authResults: null,
    receivedAt: RECEIVED,
    organizationId: "org_a",
    ...overrides,
  };
}

function raw(id: string) {
  return GET(new Request(`http://localhost/api/mailbox/failures/${id}/raw`), {
    params: Promise.resolve({ id }),
  });
}

function signInTo(orgId: string, slug: string) {
  state.activeOrgId = orgId;
  state.orgRows = [{ id: orgId, slug }];
  state.listRecent.mockResolvedValue({ items: [] });
}

describe("GET /api/mailbox/failures/[id]/raw", () => {
  beforeEach(async () => {
    state.activeOrgId = null;
    state.orgRows = [];
    state.listRecent.mockReset();
    state.failures = [failure({})];
    operatorGuard.mockReset().mockResolvedValue(undefined);
    const bucket = mailBucket();
    await bucket.delete((await bucket.list({ prefix: "mail/" })).objects.map((o) => o.key));
    await bucket.put("mail/in/2026/11/raw1.eml", RAW);
  });

  it("streams the stored .eml with the download headers", async () => {
    signInTo("org_a", "acme");
    const res = await raw("mif_a");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="email-${RECEIVED}.eml"`);
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(RAW);
  });

  it("applies operatorGuard before reading anything", async () => {
    operatorGuard.mockRejectedValue(new AuthError());
    signInTo("org_a", "acme");
    const res = await raw("mif_a");
    expect(operatorGuard).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });

  it("answers 404 for a failure in another workspace", async () => {
    state.failures = [failure({ organizationId: "org_b" })];
    signInTo("org_a", "acme");
    expect((await raw("mif_a")).status).toBe(404);
  });
});
