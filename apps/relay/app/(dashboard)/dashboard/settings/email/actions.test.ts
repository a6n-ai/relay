import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  setRouting: vi.fn(),
  setTracking: vi.fn(),
  probeTrackingDomain: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/org-scope", () => ({ requirePlatformAdmin: h.requirePlatformAdmin }));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("@relay/email", () => ({
  sesEventSettings: () => ({ setRouting: h.setRouting, setTracking: h.setTracking }),
  probeTrackingDomain: h.probeTrackingDomain,
}));
vi.mock("@/lib/email/streams", () => ({
  parseRoutingInput: (r: unknown) => r,
  parseEmailStreams: () => [
    { id: "transactional", kind: "untracked" },
    { id: "marketing", kind: "marketing" },
  ],
}));

const { saveStreamRouting, saveTrackingDomain } = await import("./actions");

describe("saveStreamRouting", () => {
  beforeEach(() => {
    h.setRouting.mockReset();
    h.requirePlatformAdmin.mockReset().mockResolvedValue(undefined);
  });

  it("saveStreamRouting refuses a non-platform admin", async () => {
    h.requirePlatformAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    const result = await saveStreamRouting("transactional", { webhook: ["delivery"] });

    expect(result.error).toBeTruthy();
    expect(h.setRouting).not.toHaveBeenCalled();
  });
});

describe("saveTrackingDomain", () => {
  beforeEach(() => {
    h.setTracking.mockReset();
    h.probeTrackingDomain.mockReset().mockResolvedValue({ ok: true });
    h.requirePlatformAdmin.mockReset().mockResolvedValue(undefined);
  });

  it("refuses a non-platform admin", async () => {
    h.requirePlatformAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    const result = await saveTrackingDomain("marketing", "track.a6n.ai");

    expect(result.error).toBeTruthy();
    expect(h.setTracking).not.toHaveBeenCalled();
  });

  it("refuses an untracked stream", async () => {
    const result = await saveTrackingDomain("transactional", "track.a6n.ai");

    expect(result.error).toBeTruthy();
    expect(h.setTracking).not.toHaveBeenCalled();
  });

  it("refuses when the probe fails and does not set tracking", async () => {
    h.probeTrackingDomain.mockResolvedValueOnce({ ok: false, reason: "It points at the wrong region." });

    const result = await saveTrackingDomain("marketing", "track.a6n.ai");

    expect(result).toEqual({ error: "It points at the wrong region." });
    expect(h.setTracking).not.toHaveBeenCalled();
  });

  it("probes then saves a verified domain", async () => {
    const result = await saveTrackingDomain("marketing", "track.a6n.ai");

    expect(result).toEqual({});
    expect(h.probeTrackingDomain).toHaveBeenCalledWith("track.a6n.ai", expect.any(String));
    expect(h.setTracking).toHaveBeenCalledWith({ id: "marketing", kind: "marketing" }, "track.a6n.ai");
  });

  it("clears without probing", async () => {
    const result = await saveTrackingDomain("marketing", null);

    expect(result).toEqual({});
    expect(h.probeTrackingDomain).not.toHaveBeenCalled();
    expect(h.setTracking).toHaveBeenCalledWith({ id: "marketing", kind: "marketing" }, null);
  });
});
