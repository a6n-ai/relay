import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  activeOrgId: null as string | null,
  orgRows: [] as { id: string; slug: string }[],
  listRecent: vi.fn(),
  attachments: [] as Record<string, unknown>[],
}));

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
vi.mock("@/lib/auth/active-org", () => ({ getActiveOrganizationId: async () => state.activeOrgId }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "ses_user" } }) }));
vi.mock("@/lib/services/tenants.service", () => ({
  tenantsService: { listRecent: (...args: unknown[]) => state.listRecent(...args) },
}));
vi.mock("@/lib/campaigns/http", () => ({ operatorGuard: async () => {} }));

vi.mock("@/db/client", async () => {
  const { organization } = await import("@/db/schema");
  const chain = (table: unknown): unknown => {
    const c = {
      innerJoin: () => c,
      where: () => ({ limit: async () => (table === organization ? state.orgRows : state.attachments) }),
    };
    return c;
  };
  return { db: { select: () => ({ from: (table: unknown) => chain(table) }) } };
});

const { GET } = await import("./route");
const { mailBucket } = await import("@/lib/mailbox/mail-bucket");

const TENANT_A = 7n;
const TENANT_B = 9n;
const BYTES = new TextEncoder().encode("<svg onload=alert(1)></svg>");

function attachment(overrides: Record<string, unknown>) {
  return {
    publicId: "att_a",
    filename: "logo.svg",
    contentType: "image/svg+xml",
    sizeBytes: BYTES.byteLength,
    storageKey: "mail/att/raw1/0-logo.svg",
    letterPublicId: "eml_a",
    tenantId: TENANT_A,
    ...overrides,
  };
}

function download(id: string) {
  return GET(new Request(`http://localhost/api/mailbox/attachments/${id}`), {
    params: Promise.resolve({ id }),
  });
}

function signInTo(orgId: string, tenantIds: bigint[]) {
  state.activeOrgId = orgId;
  state.orgRows = [{ id: orgId, slug: "acme" }];
  state.listRecent.mockResolvedValue({ items: tenantIds.map((id) => ({ id })) });
}

describe("GET /api/mailbox/attachments/[id]", () => {
  beforeEach(async () => {
    state.activeOrgId = null;
    state.orgRows = [];
    state.listRecent.mockReset();
    state.attachments = [attachment({})];
    const bucket = mailBucket();
    await bucket.delete((await bucket.list({ prefix: "mail/" })).objects.map((o) => o.key));
    await bucket.put("mail/att/raw1/0-logo.svg", BYTES);
  });

  it("streams the bytes with the exact download headers", async () => {
    signInTo("org_a", [TENANT_A]);
    const res = await download("att_a");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="logo.svg"');
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Length")).toBe(String(BYTES.byteLength));
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
  });

  it("strips CR, LF and quotes from the download filename", async () => {
    state.attachments = [attachment({ filename: 'a\r\nb"c.pdf', contentType: "application/pdf" })];
    signInTo("org_a", [TENANT_A]);
    const res = await download("att_a");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="abc.pdf"');
  });

  it("strips backslashes from the download filename", async () => {
    state.attachments = [attachment({ filename: "a\\b.pdf", contentType: "application/pdf" })];
    signInTo("org_a", [TENANT_A]);
    const res = await download("att_a");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="ab.pdf"');
  });

  it("percent-encodes ' ( ) * in filename*", async () => {
    state.attachments = [attachment({ filename: "報(1)'*.pdf", contentType: "application/pdf" })];
    signInTo("org_a", [TENANT_A]);
    const res = await download("att_a");
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="_(1)'*.pdf"; filename*=UTF-8''${encodeURIComponent("報")}%281%29%27%2A.pdf`,
    );
  });

  it("keeps a non-ASCII filename downloadable via filename*", async () => {
    state.attachments = [attachment({ filename: "報告.pdf", contentType: "application/pdf" })];
    signInTo("org_a", [TENANT_A]);
    const res = await download("att_a");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="__.pdf"; filename*=UTF-8''${encodeURIComponent("報告.pdf")}`,
    );
  });

  it("serves SVG and HTML as octet-stream, never as their own type", async () => {
    signInTo("org_a", [TENANT_A]);
    const svg = await download("att_a");
    expect(svg.headers.get("Content-Type")).toBe("application/octet-stream");
    state.attachments = [attachment({ filename: "page.html", contentType: "text/html" })];
    const html = await download("att_a");
    expect(html.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("answers 404 for an attachment on another workspace's letter", async () => {
    state.attachments = [attachment({ tenantId: TENANT_B })];
    signInTo("org_a", [TENANT_A]);
    expect((await download("att_a")).status).toBe(404);
  });

  it("answers 404, not a redirect, with no active workspace", async () => {
    const res = await download("att_a");
    expect(res.status).toBe(404);
  });
});
