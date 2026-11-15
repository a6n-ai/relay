import { describe, expect, it } from "vitest";
import { inboundAttachmentKey, inboundRawKey, safeFilename } from "./mail-bucket";

describe("safeFilename", () => {
  it("keeps only the last path part", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\docs\\invoice.pdf")).toBe("invoice.pdf");
  });

  it("drops control characters and quotes", () => {
    expect(safeFilename('a"b\'c\r\nd.pdf')).toBe("abcd.pdf");
  });

  it("caps at 100 characters and keeps the extension", () => {
    const out = safeFilename(`${"x".repeat(200)}.pdf`);
    expect(out).toHaveLength(100);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("uses file for an empty or missing name", () => {
    expect(safeFilename("")).toBe("file");
    expect(safeFilename("   ")).toBe("file");
    expect(safeFilename(null)).toBe("file");
  });
});

describe("mail keys", () => {
  it("builds the raw key from the UTC year and month", () => {
    expect(inboundRawKey("r1", Date.UTC(2026, 10, 5, 23, 59))).toBe("mail/in/2026/11/r1.eml");
  });

  it("builds attachment keys with a sanitized name", () => {
    expect(inboundAttachmentKey("r1", 2, "../a.pdf")).toBe("mail/att/r1/2-a.pdf");
  });
});
