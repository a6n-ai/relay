import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleWhatsAppWebhookGet, handleWhatsAppWebhookPost } from "./webhook-http";

describe("handleWhatsAppWebhookGet", () => {
  it("returns challenge when verify token matches", async () => {
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "42",
    });
    await expect(
      handleWhatsAppWebhookGet({ searchParams: params, verifyToken: "tok" }),
    ).resolves.toEqual({ kind: "challenge", challenge: "42" });
  });

  it("rejects when not configured", async () => {
    const result = await handleWhatsAppWebhookGet({
      searchParams: new URLSearchParams(),
      verifyToken: undefined,
    });
    expect(result).toEqual({ kind: "error", status: 503, title: "WhatsApp webhook is not configured" });
  });
});

describe("handleWhatsAppWebhookPost", () => {
  it("rejects bad signatures", async () => {
    const result = await handleWhatsAppWebhookPost({
      raw: "{}",
      signature: "sha256=dead",
      appSecret: "secret",
      onEvents: async () => {},
    });
    expect(result).toEqual({ kind: "error", status: 401, title: "Invalid signature" });
  });

  it("parses and forwards events", async () => {
    const raw = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "1555", phone_number_id: "PN1" },
                statuses: [
                  {
                    id: "wamid.1",
                    status: "delivered",
                    timestamp: "1750263773",
                    recipient_id: "16505551234",
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const hex = createHmac("sha256", "secret").update(raw).digest("hex");
    const onEvents = vi.fn(async () => {});

    const result = await handleWhatsAppWebhookPost({
      raw,
      signature: `sha256=${hex}`,
      appSecret: "secret",
      onEvents,
    });

    expect(result).toEqual({ kind: "ok", eventCount: 1 });
    expect(onEvents).toHaveBeenCalledOnce();
    const calls = onEvents.mock.calls as unknown as Array<[Array<{ kind: string; messageId: string; status: string }>]>;
    expect(calls[0]?.[0]?.[0]).toMatchObject({
      kind: "status",
      messageId: "wamid.1",
      status: "delivered",
    });
  });
});
