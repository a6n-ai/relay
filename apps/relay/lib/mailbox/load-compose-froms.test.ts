import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ includeOperatorMail: false }));

vi.mock("@/lib/apps/active-app", () => ({ resolveActiveApp: async () => null }));
vi.mock("@/lib/email/from-address", () => ({
  operatorDefaultFrom: async () => ({ email: "ops@a6n.test", name: "a6n" }),
}));
vi.mock("@/lib/services/email-senders.service", () => ({
  emailSendersService: { listRecent: async () => ({ items: [] }) },
}));
vi.mock("@/lib/services/tenants.service", () => ({
  tenantsService: { listRecent: async () => ({ items: [] }) },
}));
vi.mock("@/lib/mailbox/scope", () => ({
  mailboxScope: async () => ({ organizationId: "org_x", tenantIds: [], includeOperatorMail: state.includeOperatorMail }),
}));

const { loadComposeFroms } = await import("./load-compose-froms");

describe("loadComposeFroms", () => {
  beforeEach(() => {
    state.includeOperatorMail = false;
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
