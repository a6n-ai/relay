export const UNSUBSCRIBE_KEY_ERROR = "unsubscribe key not configured";

const encoder = new TextEncoder();

function hmacKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

const payload = (workspaceId: string, messageId: string) => encoder.encode(`unsub:v1:${workspaceId}:${messageId}`);

function base64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function unsubscribeToken(secret: string | undefined, workspaceId: string, messageId: string): Promise<string> {
  if (!secret) throw new Error(UNSUBSCRIBE_KEY_ERROR);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), payload(workspaceId, messageId));
  return `${workspaceId}.${messageId}.${base64url(sig)}`;
}

// The domain is never in the token: the send path derives it from the stored message.
export async function readUnsubscribeToken(
  secret: string | undefined,
  token: string,
): Promise<{ workspaceId: string; messageId: string } | null> {
  const parts = token.split(".");
  if (!secret || parts.length !== 3) return null;
  const [workspaceId, messageId, sig] = parts as [string, string, string];
  if (!workspaceId || !messageId.startsWith("msg_") || !sig) return null;
  try {
    const bytes = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), bytes, payload(workspaceId, messageId));
    return ok ? { workspaceId, messageId } : null;
  } catch {
    return null;
  }
}

export function unsubscribeUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/u/${token}`;
}

export function listUnsubscribeHeaders(url: string): { name: string; value: string }[] {
  return [
    { name: "List-Unsubscribe", value: `<${url}>` },
    { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
  ];
}
