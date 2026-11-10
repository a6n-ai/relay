import { afterEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: { OUTBOX: { send } } }) }));

const { signalOutbox } = await import("./outbox-signal");

describe("signalOutbox", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    send.mockReset();
  });

  it("does nothing off Workers", async () => {
    await signalOutbox();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends one wake message on Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    await signalOutbox();
    expect(send).toHaveBeenCalledWith({ at: expect.any(Number) });
  });

  it("never throws when the queue rejects", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    send.mockRejectedValue(new Error("queue down"));
    await expect(signalOutbox()).resolves.toBeUndefined();
  });
});
