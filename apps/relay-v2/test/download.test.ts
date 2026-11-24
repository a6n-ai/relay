import { describe, expect, it } from "vitest";
import { contentDisposition, previewType, safeDownloadName } from "../src/core/download";
import { previewHint } from "../src/components/preview-hint";

const bytes = (s: string) => new TextEncoder().encode(s);

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

  it("names an inline part with the same filename rules", () => {
    expect(contentDisposition("invoice.pdf", "inline")).toBe('inline; filename="invoice.pdf"');
    expect(contentDisposition("résumé.pdf", "inline")).toBe(
      `inline; filename="r_sum_.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`,
    );
  });
});

describe("previewType", () => {
  it("sniffs the PNG, JPEG, GIF, WebP and PDF signatures whatever the stored type says", () => {
    expect(previewType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]), "application/octet-stream")).toBe("image/png");
    expect(previewType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), "image/png")).toBe("image/jpeg");
    expect(previewType(bytes("GIF89a"), "text/html")).toBe("image/gif");
    expect(previewType(bytes("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "), "image/webp")).toBe("image/webp");
    expect(previewType(bytes("%PDF-1.7"), "application/octet-stream")).toBe("application/pdf");
  });

  it("needs the whole signature", () => {
    expect(previewType(Uint8Array.from([0x89, 0x50, 0x4e]), "image/png")).toBeNull();
    expect(previewType(bytes("RIFF\u0000\u0000\u0000\u0000WAVE"), "image/webp")).toBeNull();
  });

  it("previews text only when stored as text/plain and free of NUL bytes", () => {
    expect(previewType(bytes("hello <b>there</b>"), "text/plain")).toBe("text/plain; charset=utf-8");
    expect(previewType(bytes("hello"), "text/plain; charset=us-ascii")).toBe("text/plain; charset=utf-8");
    expect(previewType(bytes("a\u0000b"), "text/plain")).toBeNull();
    expect(previewType(bytes("<p>hi</p>"), "text/html")).toBeNull();
  });

  it("never previews HTML or SVG, even when labelled as an image", () => {
    expect(previewType(bytes("<html><body>x</body></html>"), "image/png")).toBeNull();
    expect(previewType(bytes("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "image/svg+xml")).toBeNull();
  });
});

describe("previewHint", () => {
  it("offers Open for a previewable stored type with a matching extension", () => {
    expect(previewHint("image/png", "scan.PNG")).toBe(true);
    expect(previewHint("image/jpeg", "photo.jpeg")).toBe(true);
    expect(previewHint("application/pdf", "invoice.pdf")).toBe(true);
    expect(previewHint("text/plain", "notes.txt")).toBe(true);
  });

  it("does not offer Open for anything else", () => {
    expect(previewHint("text/html", "page.html")).toBe(false);
    expect(previewHint("image/svg+xml", "logo.svg")).toBe(false);
    expect(previewHint("image/png", "page.html")).toBe(false);
    expect(previewHint("application/octet-stream", "blob")).toBe(false);
  });
});
