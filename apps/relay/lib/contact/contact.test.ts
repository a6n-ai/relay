import { describe, expect, it } from "vitest";
import { buildContactLetter, contactSchema, type ContactInput } from "./contact";

const valid = {
  name: "  Ada Lovelace  ",
  email: "Ada@Northwind.com",
  company: "  Northwind ",
  volume: "10k_100k",
  message: "We send about 40k emails a month and want to move off our current vendor.",
  token: "tok",
} as const;

const input = (overrides: Partial<ContactInput> = {}): ContactInput => ({ ...valid, ...overrides }) as ContactInput;

describe("contactSchema", () => {
  it("accepts a valid input and trims name and company", () => {
    const parsed = contactSchema.parse(valid);
    expect(parsed.name).toBe("Ada Lovelace");
    expect(parsed.company).toBe("Northwind");
  });

  it("rejects header injection in email", () => {
    expect(contactSchema.safeParse({ ...valid, email: "a@b.com\r\nBcc: x@y.com" }).success).toBe(false);
  });

  it("rejects messages outside 10 to 4000 characters", () => {
    expect(contactSchema.safeParse({ ...valid, message: "123456789" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, message: "x".repeat(4001) }).success).toBe(false);
  });

  it("rejects unknown volume values", () => {
    expect(contactSchema.safeParse({ ...valid, volume: "lots" }).success).toBe(false);
  });
});

describe("buildContactLetter", () => {
  const opts = { inbox: "hi@a6n.ai", now: 1, id: "u1" };

  it("builds the envelope fields", () => {
    const letter = buildContactLetter(contactSchema.parse(valid), opts);
    expect(letter.fromEmail).toBe("ada@northwind.com");
    expect(letter.fromName).toBe("Ada Lovelace");
    expect(letter.toEmail).toBe("hi@a6n.ai");
    expect(letter.subject).toBe("Website: Northwind");
    expect(letter.rfcMessageId).toBe("<contact-u1@relay.a6n.ai>");
    expect(letter.inReplyTo).toBeNull();
    expect(letter.rfcReferences).toBeNull();
    expect(letter.sentAt).toBe(1);
  });

  it("text contains every field, the volume label and the footer", () => {
    const letter = buildContactLetter(contactSchema.parse(valid), opts);
    expect(letter.text).toContain("Ada Lovelace");
    expect(letter.text).toContain("ada@northwind.com");
    expect(letter.text).toContain("Northwind");
    expect(letter.text).toContain("10k–100k");
    expect(letter.text).toContain(valid.message);
    expect(letter.text.trimEnd().endsWith("Sent from the relay.a6n.ai contact form. The email address was not verified.")).toBe(true);
  });

  it("escapes html in the message", () => {
    const letter = buildContactLetter(contactSchema.parse({ ...valid, message: "<script>alert(1)</script>" }), opts);
    expect(letter.html).toContain("&lt;script&gt;");
    expect(letter.html).not.toContain("<script>");
  });

  it("gives distinct message ids for distinct ids", () => {
    const a = buildContactLetter(contactSchema.parse(valid), { ...opts, id: "u1" });
    const b = buildContactLetter(contactSchema.parse(valid), { ...opts, id: "u2" });
    expect(a.rfcMessageId).not.toBe(b.rfcMessageId);
  });
});
