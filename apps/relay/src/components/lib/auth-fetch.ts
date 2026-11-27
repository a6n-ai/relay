const TOO_MANY = "Too many tries. Try again in a few minutes.";
const OFFLINE = "Could not reach Relay. Check your connection and try again.";

// `error` is set only for the failures every auth form words the same way (rate limit, no connection); other failures are the caller's copy.
export type AuthResult<T> = { ok: boolean; status: number; data: T | null; error: string | null };

export async function authFetch<T = unknown>(path: string, body?: unknown, tooMany = TOO_MANY): Promise<AuthResult<T>> {
  try {
    const res = await fetch(`/api/auth${path}`, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, data, error: res.status === 429 ? tooMany : null };
  } catch {
    return { ok: false, status: 0, data: null, error: OFFLINE };
  }
}
