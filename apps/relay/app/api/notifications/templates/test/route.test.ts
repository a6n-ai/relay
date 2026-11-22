import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  includeOperatorMail: false,
  sent: [] as unknown[],
}));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/campaigns/http", () => ({ operatorGuard: async () => {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { email: "ops@a6n.test" } }) }));
vi.mock("@/lib/mailbox/scope", () => ({
  mailboxScope: async () => ({ organizationId: "org_x", tenantIds: [], includeOperatorMail: state.includeOperatorMail, mailboxIds: "all" }),
}));
vi.mock("@/lib/email/from-address", () => ({
  operatorDefaultFrom: async () => ({ email: "ops@a6n.test", name: "a6n" }),
}));
vi.mock("@/lib/email/provider", () => ({
  hydrateSmtpFromDb: async () => {},
  getEmailProvider: () => ({
    send: async (msg: unknown) => {
      state.sent.push(msg);
      return { providerMessageId: "pm_1" };
    },
  }),
}));
vi.mock("@relay/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@relay/engine")>()),
  archiveMailboxLetter: async () => {},
}));

const { POST } = await import("./route");

function test() {
  return POST(
    new Request("http://localhost/api/notifications/templates/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: "Hi", html: "<p>Hi</p>", text: "Hi" }),
    }),
  );
}

describe("POST /api/notifications/templates/test", () => {
  beforeEach(() => {
    state.sent = [];
  });

  it("answers 404 and sends nothing outside the platform workspace", async () => {
    state.includeOperatorMail = false;
    const res = await test();
    expect(res.status).toBe(404);
    expect(state.sent).toHaveLength(0);
  });

  it("sends the test from the operator From in the platform workspace", async () => {
    state.includeOperatorMail = true;
    const res = await test();
    expect(res.status).toBe(200);
    expect(state.sent).toHaveLength(1);
  });
});
