import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  includeOperatorMail: false,
  tenantIds: [] as bigint[],
  listSenders: async (..._args: unknown[]) => ({ items: [] }),
  listRecent: async (..._args: unknown[]) => ({ items: [] }),
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
  mailboxScope: async () => ({ organizationId: "org_x", tenantIds: state.tenantIds, includeOperatorMail: state.includeOperatorMail }),
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
