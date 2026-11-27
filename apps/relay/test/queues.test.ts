import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleQueue } from "../src/jobs/queues";
import type { Env } from "../src/env";

describe("queue dispatch", () => {
  afterEach(() => vi.restoreAllMocks());

  it("acks an unknown queue and names it in the log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const ackAll = vi.fn();
    await handleQueue({ queue: "relay-mystery", messages: [{}, {}], ackAll } as never, env as Env);
    expect(ackAll).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith("queue relay-mystery: no handler, acked 2 messages");
  });

  it("does not route inherited object keys", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ackAll = vi.fn();
    await handleQueue({ queue: "toString", messages: [], ackAll } as never, env as Env);
    expect(ackAll).toHaveBeenCalledOnce();
  });
});
