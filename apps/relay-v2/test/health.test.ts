import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("returns ok with D1 reachable", async () => {
    const res = await SELF.fetch("https://relay.test/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, d1: true });
  });
});
