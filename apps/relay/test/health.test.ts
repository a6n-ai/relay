import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("returns ok with D1 reachable", async () => {
    const res = await SELF.fetch("https://relay.test/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, d1: true });
  });
});

describe("security headers", () => {
  it("forbids framing by other sites and sets HSTS and nosniff on every response", async () => {
    const res = await SELF.fetch("https://relay.test/api/health");
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toMatch(/^max-age=\d+/);
  });
});
