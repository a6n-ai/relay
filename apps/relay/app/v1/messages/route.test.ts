import { describe, expect, it, vi } from "vitest";

const order: string[] = [];
vi.mock("@relay/engine", () => ({ enqueueTenant: async () => void order.push("enqueue") }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ notificationTables: {} }));
vi.mock("@/lib/automations/apply-list", () => ({ applyListAutomations: async () => {} }));
vi.mock("@/lib/tenants/auth", () => ({
  authenticateTenant: async () => ({ tenantId: 1n, channels: ["email"], monthlyMessageQuota: 0 }),
  requestedChannels: () => ["email"],
}));
vi.mock("@/lib/tenants/channels", () => ({ deniedChannels: () => [] }));
vi.mock("@/lib/tenants/quota", () => ({ quotaExceeded: () => false }));
vi.mock("@/lib/tenants/usage", () => ({ countTenantSendsThisMonth: async () => 0 }));
vi.mock("@/lib/v1/message-body", () => ({
  parseMessageJson: () => ({ ok: true, data: { to: { email: "a@b.co" }, title: "t", body: "b" } }),
}));
vi.mock("@/lib/webhooks/enqueue", () => ({ enqueueTenantWebhooks: async () => {} }));
vi.mock("@/lib/runtime/outbox-signal", () => ({ signalOutbox: async () => void order.push("signal") }));

const { POST } = await import("./route");

describe("POST /v1/messages", () => {
  it("wakes the outbox only after the message is stored", async () => {
    const res = await POST(new Request("https://relay.test/v1/messages", { method: "POST", body: "{}" }));
    expect(res.status).toBe(202);
    expect(order).toEqual(["enqueue", "signal"]);
  });
});
