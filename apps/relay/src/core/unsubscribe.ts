import { fromBase64Url, hmacSha256, hmacSha256Verify, toBase64Url } from "./crypto";

const UNSUBSCRIBE_KEY_ERROR = "unsubscribe key not configured";

const encoder = new TextEncoder();

const payload = (workspaceId: string, messageId: string) => encoder.encode(`unsub:v1:${workspaceId}:${messageId}`);

export async function unsubscribeToken(secret: string | undefined, workspaceId: string, messageId: string): Promise<string> {
  if (!secret) throw new Error(UNSUBSCRIBE_KEY_ERROR);
  const sig = await hmacSha256(secret, payload(workspaceId, messageId));
  return `${workspaceId}.${messageId}.${toBase64Url(sig)}`;
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
    const ok = await hmacSha256Verify(secret, fromBase64Url(sig), payload(workspaceId, messageId));
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
