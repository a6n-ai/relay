import { describe, expect, it } from "vitest";
import { verifyTurnstile } from "./guards";

describe("verifyTurnstile", () => {
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
});
