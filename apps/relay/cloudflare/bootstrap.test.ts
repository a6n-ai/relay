import { afterEach, describe, expect, it, vi } from "vitest";
import { bootOnce, resetBootForTest } from "./bootstrap.js";

afterEach(() => vi.restoreAllMocks());

function setup(store: Map<string, string>, failGet = false) {
  resetBootForTest();
  const CACHE = {
    get: vi.fn(async (k: string) => {
      if (failGet) throw new Error("kv down");
      return store.get(k) ?? null;
    }),
    put: vi.fn(async (k: string, v: string) => void store.set(k, v)),
  };
  const env = { RELAY_WAKE: { create: vi.fn() }, CACHE, CF_VERSION_METADATA: { id: "v1" } };
  const waits: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) };
  return { env, ctx, waits };
}

describe("bootOnce", () => {
  it("books one wake a minute out per deployment, reading KV once per isolate", async () => {
    const store = new Map<string, string>();
    const t = setup(store);
    const before = Date.now();
    bootOnce(t.env, t.ctx);
    bootOnce(t.env, t.ctx);
    await Promise.all(t.waits);
    expect(t.env.CACHE.get).toHaveBeenCalledTimes(1);
    expect(store.has("wake-bootstrap:v1")).toBe(true);
    expect(t.env.RELAY_WAKE.create).toHaveBeenCalledTimes(1);
    expect(t.env.RELAY_WAKE.create.mock.calls[0][0].params.at).toBeGreaterThanOrEqual(before + 60_000);
  });

  it("does nothing when this deployment already bootstrapped (another isolate won)", async () => {
    const t = setup(new Map([["wake-bootstrap:v1", "1"]]));
    bootOnce(t.env, t.ctx);
    await Promise.all(t.waits);
    expect(t.env.RELAY_WAKE.create).not.toHaveBeenCalled();
  });

  it("skips without throwing when the KV read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = setup(new Map(), true);
    bootOnce(t.env, t.ctx);
    await Promise.all(t.waits);
    expect(t.env.RELAY_WAKE.create).not.toHaveBeenCalled();
    expect(t.env.CACHE.put).not.toHaveBeenCalled();
  });
});
