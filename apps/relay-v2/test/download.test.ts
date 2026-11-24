import { describe, expect, it } from "vitest";
import { contentDisposition, safeDownloadName } from "../src/core/download";

describe("safeDownloadName", () => {
  it("strips bidi override and format marks", () => {
    const name = safeDownloadName("invoice‮gnp.exe", "f");
    expect(name).not.toContain("‮");
    expect(name).toBe("invoicegnp.exe");
  });

  it("strips C0 and C1 controls", () => {
    expect(safeDownloadName("a\u0000b\u001fc\u007fd\u009fe.pdf", "f")).toBe("abcde.pdf");
  });

  it("removes path traversal: no slashes and no double dots", () => {
    const name = safeDownloadName("../../etc/passwd", "f");
    expect(name).not.toContain("..");
    expect(name).not.toContain("/");
    expect(name).not.toContain("\\");
    expect(safeDownloadName("a\\..\\b", "f")).not.toContain("\\");
  });

  it("removes quotes and CRLF so the header cannot be split", () => {
    const name = safeDownloadName('a"b\r\nSet-Cookie: x.pdf', "f");
    expect(name).not.toMatch(/["\r\n]/);
  });

  it("falls back when the result is empty", () => {
    expect(safeDownloadName("", "f")).toBe("f");
    expect(safeDownloadName("...", "f")).toBe("f");
    expect(safeDownloadName("  ‮  ", "f")).toBe("f");
  });

  it("trims trailing dots and spaces, including after the length cap", () => {
    expect(safeDownloadName("invoice. ", "f")).toBe("invoice");
    expect(safeDownloadName("a.b...", "f")).toBe("a.b");
    expect(safeDownloadName(`${"a".repeat(199)}. .x`, "f")).toBe("a".repeat(199));
  });

  it("caps the length at 200 characters", () => {
    expect(safeDownloadName("a".repeat(500), "f")).toHaveLength(200);
  });
});

describe("contentDisposition", () => {
  it("uses only the plain filename for a plain ASCII name", () => {
    expect(contentDisposition("invoice.pdf")).toBe('attachment; filename="invoice.pdf"');
  });

  it("adds an RFC 5987 filename* for non-ASCII names", () => {
    expect(contentDisposition("résumé.pdf")).toBe(
      `attachment; filename="r_sum_.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`,
    );
  });

  it("encodes the apostrophe and parentheses that RFC 5987 does not allow", () => {
    const value = contentDisposition("it's (1).pdf");
    expect(value).toContain("filename*=UTF-8''it%27s%20%281%29.pdf");
  });
});
