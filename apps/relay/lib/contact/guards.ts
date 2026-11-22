import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createLogger } from "@foundry/commons/logger";
import { isWorkers } from "@foundry/commons/runtime/platform";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const log = createLogger("contact-guards");

type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> };

/** Reads the body as text, or returns null once it exceeds `max` bytes (chunked bodies carry no content-length). */
export async function readCapped(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function verifyTurnstile(token: string, ip: string | null, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    log.error({}, "TURNSTILE_SECRET_KEY is unset; rejecting contact verification");
    return false;
  }
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetchFn(SITEVERIFY_URL, { method: "POST", body: form });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

export async function allowContact(ip: string): Promise<boolean> {
  if (!isWorkers()) return true;
  const limiter = (getCloudflareContext().env as unknown as { CONTACT_LIMITER?: RateLimiter }).CONTACT_LIMITER;
  if (!limiter) {
    log.warn({}, "CONTACT_LIMITER binding is missing; contact rate limit skipped");
    return true;
  }
  const { success } = await limiter.limit({ key: ip });
  return success;
}
