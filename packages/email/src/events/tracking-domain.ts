export type TrackingProbe = { ok: true } | { ok: false; reason: string };

const HOSTNAME = /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z0-9-]+$/;
const NOT_REACHED = "The address does not reach the tracking service yet. Check the DNS record and that it is proxied.";
const HTTP_ONLY = "It answers over plain HTTP only. Set SSL to Full.";
const WRONG_REGION = "It points at the wrong region.";

/** Proves the domain is a working SES tracking redirect before it is saved. */
export async function probeTrackingDomain(domain: string, region: string): Promise<TrackingProbe> {
  if (!HOSTNAME.test(domain)) {
    return { ok: false, reason: "Enter a domain like track.example.com, in lowercase, with no https:// or path." };
  }
  let res: Response;
  try {
    res = await fetch(`https://${domain}/favicon.ico`, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return { ok: false, reason: NOT_REACHED };
  }
  const protocol = res.headers.get("x-amz-ses-request-protocol");
  if (res.status !== 200 || !protocol) return { ok: false, reason: NOT_REACHED };
  if (protocol !== "https") return { ok: false, reason: HTTP_ONLY };
  if (res.headers.get("x-amz-ses-region") !== region) return { ok: false, reason: WRONG_REGION };
  return { ok: true };
}
