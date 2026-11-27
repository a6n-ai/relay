const encoder = new TextEncoder();

// Chunked: spreading a multi-megabyte array into one fromCharCode call overflows the stack.
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export const toBase64Url = (bytes: Uint8Array): string => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => fromBase64(value.replace(/-/g, "+").replace(/_/g, "/"));

export const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const hmacKey = (secret: string, usage: KeyUsage) =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

export async function hmacSha256(secret: string, data: string | Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), bytes));
}

export async function hmacSha256Verify(secret: string, signature: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<boolean> {
  return crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), signature, data);
}

// workers-types does not type crypto.subtle.timingSafeEqual.
export function constantTimeEqual(expected: Uint8Array, given: Uint8Array): boolean {
  let diff = expected.length ^ given.length;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ (given[i % given.length] ?? 0);
  return diff === 0;
}
