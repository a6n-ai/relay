import { afterEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: { RELAY_WAKE: { create } } }) }));

const { scheduleWake } = await import("./wake");

describe("scheduleWake", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    create.mockReset();
  });

  it("does nothing off Workers", async () => {
    await scheduleWake(Date.now() + 3_600_000);
    expect(create).not.toHaveBeenCalled();
  });

  it("books a wake no sooner than a minute out", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const before = Date.now();
    await scheduleWake(before);
    const { params } = create.mock.calls[0][0] as { params: { at: number } };
    expect(params.at).toBeGreaterThanOrEqual(before + 60_000);
  });

  it("keeps a later time as is", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const at = Date.now() + 13 * 3_600_000;
    await scheduleWake(at);
    expect(create).toHaveBeenCalledWith({ id: `wake-${Math.ceil(at / 60_000) * 60_000}`, params: { at } });
  });
});
