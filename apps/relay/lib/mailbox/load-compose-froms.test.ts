import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  includeOperatorMail: false,
  tenantIds: [] as bigint[],
  mailboxIds: "all" as "all" | bigint[],
  listSenders: async (..._args: unknown[]) => ({ items: [] as unknown[] }),
  listRecent: async (..._args: unknown[]) => ({ items: [] as unknown[] }),
}));

vi.mock("@/lib/apps/active-app", () => ({ resolveActiveApp: async () => null }));
vi.mock("@/lib/email/from-address", () => ({
  operatorDefaultFrom: async () => ({ email: "ops@a6n.test", name: "a6n" }),
}));
vi.mock("@/lib/services/tenant-mailboxes.service", () => ({
  tenantMailboxesService: { listSenders: (...args: unknown[]) => state.listSenders(...args) },
}));
vi.mock("@/lib/services/tenants.service", () => ({
  tenantsService: { listRecent: (...args: unknown[]) => state.listRecent(...args) },
}));
vi.mock("@/lib/mailbox/scope", () => ({
  MAILBOX_TENANT_LIMIT: 1000,
  mailboxScope: async () => ({
    organizationId: "org_x",
    tenantIds: state.tenantIds,
    includeOperatorMail: state.includeOperatorMail,
    mailboxIds: state.mailboxIds,
  }),
}));
vi.mock("@/lib/mailbox/access", () => ({
  canSeeMailbox: (access: "all" | bigint[], mailboxId: bigint | null) =>
    access === "all" || (mailboxId !== null && access.includes(mailboxId)),
}));

const { loadComposeFroms } = await import("./load-compose-froms");

describe("loadComposeFroms", () => {
  beforeEach(() => {
    state.includeOperatorMail = false;
    state.tenantIds = [];
  });

  it("lists senders only for the workspace tenants", async () => {
    state.tenantIds = [5n];
    const listSenders = vi.fn(async (..._args: unknown[]) => ({ items: [] }));
    state.listSenders = listSenders;

    await loadComposeFroms();

    expect(listSenders).toHaveBeenCalledWith([5n]);
  });

  it("loads apps with the same limit as the mailbox scope", async () => {
    const listRecent = vi.fn(async (..._args: unknown[]) => ({ items: [] }));
    state.listRecent = listRecent;

    await loadComposeFroms();

    expect(listRecent).toHaveBeenCalledWith(undefined, 1000);
  });

  it("offers a member only the Froms of mailboxes granted to them", async () => {
    state.tenantIds = [5n];
    state.mailboxIds = [11n];
    state.listRecent = async () => ({ items: [{ id: 5n, publicId: "app_a", name: "Acme" }] });
    state.listSenders = async () => ({
      items: [
        { id: 11n, publicId: "tmb_a", email: "hi@acme.test", displayName: null, verifiedAt: 1, tenantId: 5n },
        { id: 12n, publicId: "tmb_b", email: "sales@acme.test", displayName: null, verifiedAt: 1, tenantId: 5n },
      ],
    });

    const froms = await loadComposeFroms();

    expect(froms.map((f) => f.email)).toEqual(["hi@acme.test"]);
    state.mailboxIds = "all";
  });

  it("omits the operator From outside the platform workspace", async () => {
    const froms = await loadComposeFroms();
    expect(froms.find((f) => f.id === "operator")).toBeUndefined();
  });

  it("offers the operator From in the platform workspace", async () => {
    state.includeOperatorMail = true;
    const froms = await loadComposeFroms();
    expect(froms.find((f) => f.id === "operator")).toMatchObject({ email: "ops@a6n.test" });
  });
});
