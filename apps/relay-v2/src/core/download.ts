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
export function contentDisposition(name: string, kind: "attachment" | "inline" = "attachment"): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  // encodeURIComponent leaves these, and RFC 5987 attr-char does not allow them.
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const plain = `${kind}; filename="${ascii}"`;
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

export type PreviewType = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf" | "text/plain; charset=utf-8";

const SIGNATURES: [PreviewType, number[]][] = [
  ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/gif", [0x47, 0x49, 0x46, 0x38]],
  ["application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2d]],
];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
export const PREVIEW_HEAD_BYTES = 8192;

const at = (head: Uint8Array, sig: number[], offset = 0) => sig.every((b, i) => head[offset + i] === b);

// The bytes decide the type. The stored type only qualifies plain text, which has no signature.
export function previewType(head: Uint8Array, storedType: string): PreviewType | null {
  const magic = SIGNATURES.find(([, sig]) => at(head, sig));
  if (magic) return magic[0];
  if (at(head, RIFF) && at(head, WEBP, 8)) return "image/webp";
  const media = storedType.split(";")[0].trim().toLowerCase();
  if (media === "text/plain" && !head.subarray(0, PREVIEW_HEAD_BYTES).includes(0)) return "text/plain; charset=utf-8";
  return null;
}

// PDFs drop the sandbox: Chrome will not render them under it.
export function previewResponse(body: ReadableStream, size: number, name: string, type: PreviewType): Response {
  const pdf = type === "application/pdf";
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": contentDisposition(name, "inline"),
      "Content-Length": String(size),
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": pdf ? "default-src 'none'; object-src 'none'; frame-ancestors 'none'" : "sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
