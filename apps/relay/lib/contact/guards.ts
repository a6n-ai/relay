import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isWorkers } from "@foundry/commons/runtime/platform";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type RateLimiter = { limit(opts: { key: string }): Promise<{ success: boolean }> };

export async function verifyTurnstile(token: string, ip: string | null, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const form = new FormData();
  form.set("secret", process.env.TURNSTILE_SECRET_KEY ?? "");
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
  if (!limiter) return true;
  const { success } = await limiter.limit({ key: ip });
  return success;
}
