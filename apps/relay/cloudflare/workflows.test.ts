/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: class {
    env: unknown;
    constructor(_c: unknown, env: unknown) {
      this.env = env;
    }
  },
}));

afterEach(() => vi.restoreAllMocks());

describe("RelayWake", () => {
  it("sleeps until `at` then calls the tick with the cron bearer", async () => {
    const { RelayWake } = (await import("./workflows.js")) as any;
    const fetch = vi.fn(async () => new Response("{}"));
    const steps: string[] = [];
    const step = {
      sleepUntil: vi.fn(async (n: string) => void steps.push(n)),
      do: vi.fn(async (n: string, _o: unknown, fn: () => Promise<void>) => (steps.push(n), fn())),
    };
    const at = Date.now() + 60_000;
    await new RelayWake({}, { WORKER_SELF_REFERENCE: { fetch }, CRON_SECRET: "s" }).run({ payload: { at } }, step);
    expect(step.sleepUntil).toHaveBeenCalledWith("wait", new Date(at));
    expect(steps).toEqual(["wait", "run"]);
    expect(fetch).toHaveBeenCalledWith(
      "https://internal/api/internal/tick",
      expect.objectContaining({ method: "POST", headers: { authorization: "Bearer s" } }),
    );
  });

  it("books a 15 min fallback wake when the tick still fails after retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { RelayWake } = (await import("./workflows.js")) as any;
    const create = vi.fn();
    const env = {
      WORKER_SELF_REFERENCE: { fetch: async () => new Response("x", { status: 500 }) },
      CRON_SECRET: "s",
      RELAY_WAKE: { create },
    };
    const step = { sleepUntil: vi.fn(), do: (_n: string, ...rest: any[]) => rest[rest.length - 1]() };
    const before = Date.now();
    await new RelayWake({}, env).run({ payload: { at: 1 } }, step);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].params.at).toBeGreaterThanOrEqual(before + 15 * 60_000);
  });
});
