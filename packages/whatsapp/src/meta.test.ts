import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MetaWhatsAppClient, normalizeWaTo } from "./meta/graph-client";
import { MetaGraphError } from "./meta/types";
import { verifyWhatsAppWebhookChallenge, verifyWhatsAppWebhookSignature } from "./meta/webhook";
import { parseWhatsAppWebhook } from "./meta/webhook-payload";
import { MetaCloudWhatsAppProvider } from "./meta-cloud-provider";
import { createWhatsAppProviderFromEnv, whatsappTransportKind } from "./from-env";
import { TwilioWhatsAppProvider } from "./twilio-provider";

function mockFetch(impl: typeof fetch) {
  return vi.fn(impl);
}

function lastCall(fetchImpl: ReturnType<typeof mockFetch>): { url: string; body?: string; method?: string } {
  const calls = fetchImpl.mock.calls as unknown as Array<[unknown, { method?: string; body?: unknown }?]>;
  const call = calls.at(-1);
  if (!call) throw new Error("fetch was not called");
  return { url: String(call[0]), method: call[1]?.method, body: call[1]?.body == null ? undefined : String(call[1].body) };
}

describe("normalizeWaTo", () => {
  it("strips plus and whatsapp prefix", () => {
    expect(normalizeWaTo("+16505551234")).toBe("16505551234");
    expect(normalizeWaTo("whatsapp:+16505551234")).toBe("16505551234");
  });
});

describe("MetaWhatsAppClient", () => {
  it("sends a text message via Cloud API", async () => {
    const fetchImpl = mockFetch(async () =>
      Response.json({
        messages: [{ id: "wamid.TEXT" }],
        contacts: [{ input: "16505551234", wa_id: "16505551234" }],
      }),
    );
    const client = new MetaWhatsAppClient({
      accessToken: "tok",
      phoneNumberId: "PN1",
      fetch: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.sendText({
      phoneNumberId: "PN1",
      to: "+16505551234",
      body: "hello",
    });

    expect(result.messageId).toBe("wamid.TEXT");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const { url, method, body: rawBody } = lastCall(fetchImpl);
    expect(url).toBe("https://graph.facebook.com/v22.0/PN1/messages");
    expect(method).toBe("POST");
    const body = JSON.parse(String(rawBody));
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      to: "16505551234",
      type: "text",
      text: { body: "hello", preview_url: false },
    });
  });

  it("sends a template message via Cloud API", async () => {
    const fetchImpl = mockFetch(async () => Response.json({ messages: [{ id: "wamid.TPL" }] }));
    const client = new MetaWhatsAppClient({
      accessToken: "tok",
      fetch: fetchImpl as unknown as typeof fetch,
    });

    await client.sendTemplate({
      phoneNumberId: "PN1",
      to: "16505551234",
      name: "hello_world",
      languageCode: "en_US",
      bodyParameters: [{ type: "text", text: "Ada" }],
    });

    const body = JSON.parse(String(lastCall(fetchImpl).body));
    expect(body.type).toBe("template");
    expect(body.template).toMatchObject({
      name: "hello_world",
      language: { code: "en_US" },
      components: [{ type: "body", parameters: [{ type: "text", text: "Ada" }] }],
    });
  });

  it("lists phone numbers via Business Management API", async () => {
    const fetchImpl = mockFetch(async () =>
      Response.json({
        data: [
          {
            id: "PN1",
            display_phone_number: "+1 650-555-1234",
            verified_name: "Relay",
            quality_rating: "GREEN",
          },
        ],
      }),
    );
    const client = new MetaWhatsAppClient({
      accessToken: "tok",
      wabaId: "WABA1",
      fetch: fetchImpl as unknown as typeof fetch,
    });

    const phones = await client.listPhoneNumbers();
    expect(phones).toEqual([
      {
        id: "PN1",
        displayPhoneNumber: "+1 650-555-1234",
        verifiedName: "Relay",
        qualityRating: "GREEN",
        codeVerificationStatus: undefined,
      },
    ]);
    expect(lastCall(fetchImpl).url).toContain("/WABA1/phone_numbers");
  });

  it("lists message templates via Business Management API", async () => {
    const fetchImpl = mockFetch(async () =>
      Response.json({
        data: [{ id: "1", name: "hello_world", language: "en_US", status: "APPROVED", category: "UTILITY" }],
      }),
    );
    const client = new MetaWhatsAppClient({
      accessToken: "tok",
      wabaId: "WABA1",
      fetch: fetchImpl as unknown as typeof fetch,
    });

    const templates = await client.listMessageTemplates();
    expect(templates[0]?.name).toBe("hello_world");
    expect(lastCall(fetchImpl).url).toContain("/WABA1/message_templates");
  });

  it("throws MetaGraphError on non-2xx", async () => {
    const fetchImpl = mockFetch(async () => new Response('{"error":{"message":"nope"}}', { status: 400 }));
    const client = new MetaWhatsAppClient({
      accessToken: "tok",
      fetch: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      client.sendText({ phoneNumberId: "PN1", to: "1", body: "x" }),
    ).rejects.toBeInstanceOf(MetaGraphError);
  });
});

describe("webhook helpers", () => {
  it("verifies the hub challenge", () => {
    expect(
      verifyWhatsAppWebhookChallenge(
        { "hub.mode": "subscribe", "hub.verify_token": "secret", "hub.challenge": "12345" },
        "secret",
      ),
    ).toBe("12345");
    expect(
      verifyWhatsAppWebhookChallenge(
        { "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345" },
        "secret",
      ),
    ).toBeNull();
  });

  it("verifies X-Hub-Signature-256", () => {
    const body = '{"object":"whatsapp_business_account"}';
    const secret = "app-secret";
    const hex = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWhatsAppWebhookSignature(body, `sha256=${hex}`, secret)).toBe(true);
    expect(verifyWhatsAppWebhookSignature(body, `sha256=${hex}`, "other")).toBe(false);
    expect(verifyWhatsAppWebhookSignature(body, null, secret)).toBe(false);
  });

  it("parses inbound + status + account_update payloads", () => {
    const { events } = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA1",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "PN1", display_phone_number: "1555" },
                contacts: [{ profile: { name: "Ada" }, wa_id: "16505551234" }],
                messages: [
                  {
                    from: "16505551234",
                    id: "wamid.in",
                    timestamp: "1749416383",
                    type: "text",
                    text: { body: "hi" },
                  },
                ],
                statuses: [
                  {
                    id: "wamid.out",
                    status: "failed",
                    timestamp: "1749416384",
                    recipient_id: "16505551234",
                    errors: [{ code: 131026, title: "Message undeliverable" }],
                  },
                ],
              },
            },
            {
              field: "account_update",
              value: { event: "PARTNER_ADDED" },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      kind: "inbound_message",
      from: "16505551234",
      textBody: "hi",
      contactName: "Ada",
    });
    expect(events[1]).toMatchObject({ kind: "status", status: "failed", messageId: "wamid.out" });
    expect(events[2]).toMatchObject({ kind: "account_update", event: "PARTNER_ADDED" });
  });
});

describe("MetaCloudWhatsAppProvider", () => {
  it("maps providerTemplateId to Meta template name", async () => {
    const fetchImpl = mockFetch(async () => Response.json({ messages: [{ id: "wamid.1" }] }));
    const provider = new MetaCloudWhatsAppProvider({
      accessToken: "tok",
      phoneNumberId: "PN1",
      fetch: fetchImpl as unknown as typeof fetch,
    });

    const out = await provider.send({
      to: { phone: "+16505551234" },
      providerTemplateId: "order_shipped",
      vars: { language: "en", customer_name: "Ada" },
    });

    expect(out.providerMessageId).toBe("wamid.1");
    const body = JSON.parse(String(lastCall(fetchImpl).body));
    expect(body.template.name).toBe("order_shipped");
    expect(body.template.language.code).toBe("en");
    expect(body.template.components[0].parameters[0]).toEqual({
      type: "text",
      text: "Ada",
      parameter_name: "customer_name",
    });
  });
});

describe("createWhatsAppProviderFromEnv", () => {
  it("prefers Meta when Cloud creds are present", () => {
    expect(
      whatsappTransportKind({
        WHATSAPP_ACCESS_TOKEN: "t",
        WHATSAPP_PHONE_NUMBER_ID: "pn",
        TWILIO_ACCOUNT_SID: "ACxx",
        TWILIO_AUTH_TOKEN: "tok",
        TWILIO_WHATSAPP_FROM: "+1",
      }),
    ).toBe("meta");
    expect(
      createWhatsAppProviderFromEnv({
        WHATSAPP_ACCESS_TOKEN: "t",
        WHATSAPP_PHONE_NUMBER_ID: "pn",
      }),
    ).toBeInstanceOf(MetaCloudWhatsAppProvider);
  });

  it("falls back to Twilio", () => {
    const p = createWhatsAppProviderFromEnv({
      TWILIO_ACCOUNT_SID: "ACxx",
      TWILIO_AUTH_TOKEN: "tok",
      TWILIO_WHATSAPP_FROM: "+15551234567",
    });
    expect(p).toBeInstanceOf(TwilioWhatsAppProvider);
  });

  it("returns undefined when nothing configured", () => {
    expect(createWhatsAppProviderFromEnv({})).toBeUndefined();
  });
});
