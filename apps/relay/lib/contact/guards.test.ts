import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readCapped, verifyTurnstile } from "./guards";

describe("readCapped", () => {
  it("returns null once the body exceeds the cap", async () => {
    const chunk = new Uint8Array(10_000).fill(97);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const req = new Request("https://relay.a6n.ai/api/contact", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readCapped(req, 16_384)).resolves.toBeNull();
  });

  it("returns the decoded text of a small body", async () => {
    const req = new Request("https://relay.a6n.ai/api/contact", { method: "POST", body: "héllo" });
    await expect(readCapped(req, 16_384)).resolves.toBe("héllo");
  });
});

describe("verifyTurnstile", () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;

  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalSecret;
  });

  it("is false when the siteverify call fails on the network", async () => {
    const fetchFn = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await expect(verifyTurnstile("tok", "203.0.113.1", fetchFn)).resolves.toBe(false);
  });

  it("is false when siteverify does not return success", async () => {
    const fetchFn = (async () => Response.json({ success: false })) as unknown as typeof fetch;
    await expect(verifyTurnstile("tok", null, fetchFn)).resolves.toBe(false);
  });

  it("is true when siteverify returns success", async () => {
    const fetchFn = (async () => Response.json({ success: true })) as unknown as typeof fetch;
    await expect(verifyTurnstile("tok", "203.0.113.1", fetchFn)).resolves.toBe(true);
  });

  it("fails closed without calling siteverify when the secret is unset", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const fetchFn = vi.fn(async () => Response.json({ success: true })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
    await expect(verifyTurnstile("tok", "203.0.113.1", fetchFn)).resolves.toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
