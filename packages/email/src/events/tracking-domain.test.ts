import { afterEach, describe, expect, it, vi } from "vitest";
import { probeTrackingDomain } from "./tracking-domain";

const ok = (headers: Record<string, string> = {}, status = 200) =>
  new Response(null, { status, headers: { "x-amz-ses-request-protocol": "https", "x-amz-ses-region": "ap-south-1", ...headers } });

afterEach(() => vi.restoreAllMocks());

describe("probeTrackingDomain", () => {
  it("accepts a domain that answers over https from the right region", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
    expect(await probeTrackingDomain("track.a6n.ai", "ap-south-1")).toEqual({ ok: true });
    expect(fetchSpy.mock.calls[0][0]).toBe("https://track.a6n.ai/favicon.ico");
  });

  it.each(["https://track.a6n.ai", "Track.a6n.ai", "track.a6n.ai/x", "localhost", "a b.example.com"])("rejects malformed host %s without fetching", async (host) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect((await probeTrackingDomain(host, "ap-south-1")).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports unreachable when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const r = await probeTrackingDomain("track.a6n.ai", "ap-south-1");
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.reason).toMatch(/does not reach/);
  });

  it("reports unreachable on a non-200 or a non-SES response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(ok({}, 404)).mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await probeTrackingDomain("track.a6n.ai", "ap-south-1")).toMatchObject({ ok: false, reason: expect.stringMatching(/does not reach/) });
    expect(await probeTrackingDomain("track.a6n.ai", "ap-south-1")).toMatchObject({ ok: false, reason: expect.stringMatching(/does not reach/) });
  });

  it("refuses a domain that answers over plain HTTP", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok({ "x-amz-ses-request-protocol": "http" }));
    expect(await probeTrackingDomain("track.a6n.ai", "ap-south-1")).toMatchObject({ ok: false, reason: expect.stringMatching(/plain HTTP/) });
  });

  it("refuses a domain that points at another region", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok({ "x-amz-ses-region": "us-east-1" }));
    expect(await probeTrackingDomain("track.a6n.ai", "ap-south-1")).toMatchObject({ ok: false, reason: expect.stringMatching(/wrong region/) });
  });
});
