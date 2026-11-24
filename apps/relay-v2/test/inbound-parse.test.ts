import { describe, expect, it } from "vitest";
import { InboundParseError, parseInboundEml, safeFilename } from "../src/core/inbound-parse";

const eml = (lines: string[]) => new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer;

const headers = [
  'From: "Cust" <Cust@Example.com>',
  "To: info@tiffingrab.ca",
  "Subject: Invoice",
  "Message-ID: <abc@x>",
  "Date: Tue, 01 Jul 2025 10:00:00 +0000",
  "MIME-Version: 1.0",
];

const multipart = [
  ...headers,
  'Content-Type: multipart/mixed; boundary="B"',
  "",
  "--B",
  'Content-Type: multipart/alternative; boundary="A"',
  "",
  "--A",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hello text",
  "--A",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>Hello html</p>",
  "--A--",
  "--B",
  'Content-Type: application/pdf; name="invoice.pdf"',
  'Content-Disposition: attachment; filename="invoice.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  "JVBERi0=",
  "--B--",
];

describe("parseInboundEml", () => {
  it("parses a multipart letter with both bodies and an attachment", async () => {
    const letter = await parseInboundEml(eml(multipart));

    expect(letter).toMatchObject({
      fromEmail: "cust@example.com",
      fromName: "Cust",
      toEmail: "info@tiffingrab.ca",
      subject: "Invoice",
      rfcMessageId: "abc@x",
      text: expect.stringContaining("Hello text"),
      html: expect.stringContaining("<p>Hello html</p>"),
    });
    expect(letter.attachments).toHaveLength(1);
    expect(letter.attachments[0]).toMatchObject({ filename: "invoice.pdf", mimeType: "application/pdf" });
  });

  it("gives a null toEmail when the letter has no To header", async () => {
    const letter = await parseInboundEml(eml(multipart.filter((l) => !l.startsWith("To:"))));

    expect(letter.toEmail).toBeNull();
  });

  it("throws Missing Message-ID when the letter has no Message-ID", async () => {
    const lines = multipart.filter((l) => !l.startsWith("Message-ID:"));

    await expect(parseInboundEml(eml(lines))).rejects.toThrow(InboundParseError);
    await expect(parseInboundEml(eml(lines))).rejects.toThrow("Missing Message-ID");
  });

  it("throws Empty body when both bodies are empty", async () => {
    const lines = [...headers, "Content-Type: text/plain; charset=utf-8", "", ""];

    await expect(parseInboundEml(eml(lines))).rejects.toThrow("Empty body");
  });

  it("gives a null sentAt when the Date header does not parse", async () => {
    const lines = headers.map((l) => (l.startsWith("Date:") ? "Date: not a date" : l));
    const letter = await parseInboundEml(eml([...lines, "Content-Type: text/plain", "", "hi"]));

    expect(letter.sentAt).toBeNull();
  });
});

describe("safeFilename", () => {
  it("keeps only the last path segment without quotes", () => {
    expect(safeFilename('../../a\\b".exe')).toBe("b.exe");
  });

  it("falls back to file for a missing name", () => {
    expect(safeFilename(null)).toBe("file");
  });
});
