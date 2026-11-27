import type { Env } from "../env";

// Their mail is live (login codes, the a6n workspace's own sending), so a new row for them is never releasable or deletable by accident.
const DEFAULT_PROTECTED = "relay.a6n.ai,a6n.ai,tiffingrab.ca,notify.tiffingrab.ca";

export const isProtectedDomain = (env: Pick<Env, "PROTECTED_DOMAINS">, domain: string): boolean =>
  (env.PROTECTED_DOMAINS ?? DEFAULT_PROTECTED)
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .includes(domain.toLowerCase());
