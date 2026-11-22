import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tenantIds: [] as bigint[],
  row: null as null | { domain: string; verifyToken: string; tenantId: bigint },
  verifyOwnership: vi.fn(),
  update: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("node:dns", () => ({ promises: { resolveTxt: vi.fn() } }));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/mailbox/scope", () => ({
  mailboxScope: async () => ({ organizationId: "org_x", tenantIds: h.tenantIds, includeOperatorMail: false }),
}));
vi.mock("@relay/email", () => ({
  generateDkimKeyPair: vi.fn(),
  generateDomainVerifyToken: vi.fn(),
  verifySendingDomainOwnership: h.verifyOwnership,
}));
vi.mock("@/lib/services/sending.service", () => ({
  sendingDomainsService: {
    read: async () => h.row,
    update: h.update,
    create: vi.fn(),
  },
}));
vi.mock("@/lib/services/tenant-mailboxes.service", () => ({
  tenantMailboxesService: { refreshVerification: vi.fn() },
}));
vi.mock("@/lib/services/tenants.service", () => ({ tenantsService: { findBySlug: vi.fn() } }));

const { verifySendingDomainAction } = await import("./actions");

function form(publicId: string) {
  const fd = new FormData();
  fd.set("publicId", publicId);
  return fd;
}

describe("verifySendingDomainAction", () => {
  beforeEach(() => {
    h.tenantIds = [1n];
    h.row = { domain: "mail.acme.test", verifyToken: "tok", tenantId: 1n };
    h.verifyOwnership.mockReset().mockResolvedValue(true);
    h.update.mockReset();
  });

  it("verify refuses a domain from another workspace", async () => {
    h.row = { domain: "mail.other.test", verifyToken: "tok", tenantId: 2n };

    const result = await verifySendingDomainAction(form("dom_other"));

    expect(result).toEqual({ error: "Unknown domain" });
    expect(h.verifyOwnership).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
});
