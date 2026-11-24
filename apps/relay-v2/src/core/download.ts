// Bidi overrides and isolates, plus the zero-width marks that can reorder a name on screen.
const BIDI_AND_FORMAT = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;
// Unpaired surrogates make encodeURIComponent throw.
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
const MAX_NAME = 200;

// Attachment names come from untrusted mail. This runs before the name reaches a header or a path.
export function safeDownloadName(name: string, fallback: string): string {
  const cleaned = name
    .replace(CONTROLS, "")
    .replace(BIDI_AND_FORMAT, "")
    .replace(LONE_SURROGATE, "")
    .replace(/"/g, "")
    .replace(/[/\\]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[\s.]+/, "");
  const capped = [...cleaned].slice(0, MAX_NAME).join("").replace(/[\s.]+$/, "");
  return capped || fallback;
}

// The plain form is used when the name is ASCII and needs no escaping; otherwise filename* carries the UTF-8.
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  // encodeURIComponent leaves these, and RFC 5987 attr-char does not allow them.
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const plain = `attachment; filename="${ascii}"`;
  return ascii === name && encoded === name ? plain : `${plain}; filename*=UTF-8''${encoded}`;
}

// The body is streamed straight through from R2; the size only sets Content-Length.
export function downloadResponse(body: ReadableStream, size: number, name: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": contentDisposition(name),
      "Content-Length": String(size),
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
