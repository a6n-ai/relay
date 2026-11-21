import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ domainVerified: true }));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
vi.mock("./sending.service", () => ({
  sendingDomainsService: {
    list: async () => ({ items: state.domainVerified ? [{ domain: "shop.test" }] : [] }),
  },
}));

const { tenantMailboxesService } = await import("./tenant-mailboxes.service");

function mailbox(overrides: Record<string, unknown>) {
  return {
    publicId: "tmb_a",
    tenantId: 7n,
    localPart: "help",
    domain: "shop.test",
    email: "help@shop.test",
    kind: "relay_inbox",
    displayName: null,
    verifiedAt: null,
    canSend: true,
    ...overrides,
  };
}

describe("tenantMailboxesService sending", () => {
  beforeEach(() => {
    state.domainVerified = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifiedSendersForTenant excludes unverified", async () => {
    vi.spyOn(tenantMailboxesService, "list").mockResolvedValue({
      items: [
        mailbox({ publicId: "tmb_unverified", verifiedAt: null }),
        mailbox({ publicId: "tmb_verified", verifiedAt: 1 }),
      ],
    } as never);

    const senders = await tenantMailboxesService.verifiedSendersForTenant(7n);

    expect(senders.map((s) => s.publicId)).toEqual(["tmb_verified"]);
  });

  it("listSenders returns empty without tenants", async () => {
    const listRecent = vi.spyOn(tenantMailboxesService, "listRecent");

    await expect(tenantMailboxesService.listSenders([])).resolves.toEqual({ items: [] });
    expect(listRecent).not.toHaveBeenCalled();
  });

  it("updateSending rejects people_inbox", async () => {
    vi.spyOn(tenantMailboxesService, "read").mockResolvedValue(
      mailbox({ kind: "people_inbox", email: "hello@mail.shop.test", domain: "mail.shop.test" }) as never,
    );
    const update = vi.spyOn(tenantMailboxesService, "update");

    await expect(
      tenantMailboxesService.updateSending("tmb_a", { canSend: true, displayName: "Help" }),
    ).resolves.toEqual({ error: "People inboxes send from their own mail host" });
    expect(update).not.toHaveBeenCalled();
  });

  it("updateSending on sets verifiedAt when domain verified", async () => {
    vi.spyOn(tenantMailboxesService, "read").mockResolvedValue(mailbox({}) as never);
    const update = vi.spyOn(tenantMailboxesService, "update").mockResolvedValue({} as never);

    await tenantMailboxesService.updateSending("tmb_a", { canSend: true, displayName: "Help" });

    expect(update).toHaveBeenCalledWith("tmb_a", {
      canSend: true,
      displayName: "Help",
      verifiedAt: expect.any(Number),
    });
  });

  it("updateSending keeps existing verifiedAt", async () => {
    vi.spyOn(tenantMailboxesService, "read").mockResolvedValue(mailbox({ verifiedAt: 500 }) as never);
    const update = vi.spyOn(tenantMailboxesService, "update").mockResolvedValue({} as never);

    await tenantMailboxesService.updateSending("tmb_a", { canSend: true, displayName: "Help" });

    expect(update).toHaveBeenCalledWith("tmb_a", {
      canSend: true,
      displayName: "Help",
      verifiedAt: 500,
    });
  });
});
