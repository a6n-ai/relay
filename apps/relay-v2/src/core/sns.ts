import { createVerify } from "node:crypto";
import { z } from "zod";

export const snsMessageSchema = z.object({
  Type: z.string(),
  MessageId: z.string(),
  TopicArn: z.string(),
  Message: z.string(),
  Timestamp: z.string(),
  SignatureVersion: z.string(),
  Signature: z.string(),
  SigningCertURL: z.string(),
  Subject: z.string().optional(),
  SubscribeURL: z.string().optional(),
  Token: z.string().optional(),
});
export type SnsMessage = z.infer<typeof snsMessageSchema>;

const NOTIFICATION_KEYS = ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"] as const;
const CONFIRMATION_KEYS = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] as const;

// Key order and the Subject rule are fixed by AWS's signing spec.
export function snsStringToSign(msg: SnsMessage): string {
  const keys = msg.Type === "Notification" ? NOTIFICATION_KEYS : CONFIRMATION_KEYS;
  return keys
    .filter((k) => msg[k] !== undefined)
    .map((k) => `${k}\n${msg[k]}\n`)
    .join("");
}

export function snsRegion(topicArn: string): string {
  return topicArn.split(":")[3] ?? "";
}

// Only the regional SNS host. The region comes from the allowlisted topic, so a foreign host never passes.
export function snsHostUrl(url: string, region: string): URL | null {
  try {
    const u = new URL(url);
    return u.origin === `https://sns.${region}.amazonaws.com` ? u : null;
  } catch {
    return null;
  }
}

export function isValidSnsCertUrl(url: string, topicRegion: string): boolean {
  const u = snsHostUrl(url, topicRegion);
  return (
    u !== null &&
    u.search === "" &&
    u.hash === "" &&
    !u.username &&
    !u.password &&
    /^\/SimpleNotificationService-[0-9a-f]+\.pem$/.test(u.pathname)
  );
}

// Bounded: cert names are attacker-chosen, so unbounded growth would exhaust memory.
const CERT_CACHE_MAX = 32;
const certs = new Map<string, string>();

function cacheCert(key: string, pem: string): void {
  if (certs.size >= CERT_CACHE_MAX) certs.delete(certs.keys().next().value as string);
  certs.set(key, pem);
}

// Test seam: lets route tests verify against the fixture cert without network.
export function primeCertCache(url: string, pem: string): void {
  cacheCert(url, pem);
}

async function fetchPem(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "error" });
  if (!res.ok) throw new Error(`cert fetch ${res.status}`);
  return res.text();
}

// Never throws: any failure is a rejection.
export async function verifySnsMessage(
  msg: SnsMessage,
  fetchCert: (url: string) => Promise<string> = fetchPem,
): Promise<boolean> {
  try {
    if (!isValidSnsCertUrl(msg.SigningCertURL, snsRegion(msg.TopicArn))) return false;
    const alg = msg.SignatureVersion === "2" ? "RSA-SHA256" : msg.SignatureVersion === "1" ? "RSA-SHA1" : null;
    if (!alg) return false;
    const key = new URL(msg.SigningCertURL).href;
    let pem = certs.get(key);
    if (!pem) {
      pem = await fetchCert(key);
      cacheCert(key, pem);
    }
    const verifier = createVerify(alg);
    verifier.update(snsStringToSign(msg));
    return verifier.verify(pem, msg.Signature, "base64");
  } catch {
    return false;
  }
}
