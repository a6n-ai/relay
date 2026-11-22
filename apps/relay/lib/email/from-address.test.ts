import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selfServe: false,
  verified: [] as Array<{ email: string; displayName: string | null }>,
}));

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: async () => [{ selfServe: state.selfServe }] }),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/services/tenant-mailboxes.service", () => ({
  tenantMailboxesService: { verifiedSendersForTenant: async () => state.verified },
}));
vi.mock("@/lib/services/sending.service", () => ({
  smtpSettingsService: { list: async () => ({ items: [] }) },
}));

import { resolveTenantEmailFrom } from "./from-address";

describe("resolveTenantEmailFrom", () => {
  beforeEach(() => {
    state.selfServe = false;
    state.verified = [];
    process.env.NOTIFY_FROM_EMAIL = "ops@operator.test";
  });

  it("self-serve workspace without a domain gets no From", async () => {
    state.selfServe = true;
    expect(await resolveTenantEmailFrom(7n)).toBeNull();
  });

  it("client workspace without a domain falls back to the operator From", async () => {
    expect(await resolveTenantEmailFrom(7n)).toEqual({
      email: "ops@operator.test",
      name: undefined,
      source: "operator",
    });
  });

  it("self-serve workspace with a verified mailbox uses it", async () => {
    state.selfServe = true;
    state.verified = [{ email: "hello@acme.test", displayName: "Acme" }];
    expect(await resolveTenantEmailFrom(7n)).toEqual({
      email: "hello@acme.test",
      name: "Acme",
      source: "tenant",
    });
  });
});
