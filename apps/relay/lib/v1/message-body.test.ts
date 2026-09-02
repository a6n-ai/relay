import { describe, expect, it } from "vitest";
import { parseMessageJson } from "./message-body";

describe("parseMessageJson", () => {
  it("accepts a transactional email with defaults applied by the route", () => {
    const parsed = parseMessageJson({
      title: "Hello",
      body: "World",
      to: { email: "dev@example.com" },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.title).toBe("Hello");
      expect(parsed.data.kind).toBeUndefined();
      expect(parsed.data.channels).toBeUndefined();
    }
  });

  it("accepts phone-only or userId-only recipients", () => {
    expect(parseMessageJson({ title: "a", body: "b", to: { phone: "+15551212" } }).ok).toBe(true);
    expect(parseMessageJson({ title: "a", body: "b", to: { userId: "usr_1" } }).ok).toBe(true);
  });

  it("rejects missing recipient, bad email, and empty title", () => {
    expect(parseMessageJson({ title: "a", body: "b", to: {} })).toMatchObject({
      ok: false,
      title: "Recipient required",
      status: 400,
    });
    expect(parseMessageJson({ title: "a", body: "b", to: { email: "not-an-email" } })).toMatchObject({
      ok: false,
      title: "Invalid body",
    });
    expect(parseMessageJson({ title: "", body: "b", to: { email: "a@b.com" } })).toMatchObject({
      ok: false,
      title: "Invalid body",
    });
  });

  it("accepts marketing + extra channels and an idempotency key", () => {
    const parsed = parseMessageJson({
      kind: "marketing",
      channels: ["email", "sms"],
      title: "Sale",
      body: "Hi",
      to: { email: "a@b.com" },
      idempotencyKey: "sale:1",
      vars: { city: "Toronto" },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.kind).toBe("marketing");
      expect(parsed.data.channels).toEqual(["email", "sms"]);
      expect(parsed.data.idempotencyKey).toBe("sale:1");
    }
  });

  it("accepts a delayed sendAt timestamp", () => {
    const parsed = parseMessageJson({
      title: "Later",
      body: "Hi",
      to: { email: "a@b.com" },
      sendAt: 1_800_000_000_000,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.sendAt).toBe(1_800_000_000_000);
  });
});
