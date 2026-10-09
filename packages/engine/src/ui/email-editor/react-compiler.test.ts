import { describe, expect, it, vi } from "vitest";
import { createReactCompiler, type WorkerLike } from "./react-compiler";
import { compileReactSource } from "../react-template";

function fakeWorker(reply?: (m: { id: number; source: string }) => unknown, { ready = true } = {}) {
  const listeners = new Set<(e: { data: unknown }) => void>();
  let isReady = false;
  const queued: { id: number; source: string }[] = [];
  const deliver = (m: { id: number; source: string }) => {
    if (reply) queueMicrotask(() => listeners.forEach((f) => f({ data: reply(m) })));
  };
  // Like the real worker: messages wait until chunks are loaded and globals locked, then it says so.
  const announce = () => {
    isReady = true;
    listeners.forEach((f) => f({ data: { ready: true } }));
    queued.splice(0).forEach(deliver);
  };
  if (ready) queueMicrotask(announce);
  const w: WorkerLike & { terminated: boolean; announce: () => void } = {
    terminated: false,
    announce,
    postMessage: (m) => {
      const msg = m as { id: number; source: string };
      if (isReady) deliver(msg);
      else queued.push(msg);
    },
    addEventListener: (_t, f) => listeners.add(f),
    removeEventListener: (_t, f) => listeners.delete(f),
    terminate() {
      this.terminated = true;
    },
  };
  return w;
}

describe("createReactCompiler", () => {
  it("resolves with the worker's html", async () => {
    const c = createReactCompiler({ spawn: () => fakeWorker((m) => ({ id: m.id, html: "<p>ok</p>" })) });
    await expect(c.compile("x")).resolves.toBe("<p>ok</p>");
  });
  it("rejects with the worker's error", async () => {
    const c = createReactCompiler({ spawn: () => fakeWorker((m) => ({ id: m.id, error: "boom" })) });
    await expect(c.compile("x")).rejects.toThrow("boom");
  });
  it("kills a runaway compile after the timeout and starts a fresh worker next time", async () => {
    vi.useFakeTimers();
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const c = createReactCompiler({ timeoutMs: 2000, spawn: () => (workers.push(fakeWorker()), workers.at(-1)!) });
    const p = c.compile("while(true){}");
    const settled = expect(p).rejects.toThrow("took longer than 2s");
    await vi.advanceTimersByTimeAsync(2001);
    await settled;
    expect(workers[0]!.terminated).toBe(true);
    void c.compile("x").catch(() => {});
    expect(workers).toHaveLength(2);
    vi.useRealTimers();
  });
});

describe("createReactCompiler — slow worker start-up", () => {
  it("does not count worker start-up against the render timeout", async () => {
    vi.useFakeTimers();
    const w = fakeWorker((m) => ({ id: m.id, html: "<p>late but fine</p>" }), { ready: false });
    const c = createReactCompiler({ timeoutMs: 2000, spawn: () => w });
    const p = c.compile("x");
    await vi.advanceTimersByTimeAsync(5000); // chunks still downloading
    w.announce();
    await vi.advanceTimersByTimeAsync(10);
    await expect(p).resolves.toBe("<p>late but fine</p>");
    vi.useRealTimers();
  });
});

describe("compileReactSource", () => {
  it("renders a react-email component to html", async () => {
    const html = await compileReactSource(
      "export default function E(){ return <Html><Body><Text>{'Hello {{contact.first_name}}'}</Text></Body></Html>; }",
    );
    expect(html).toContain("Hello {{contact.first_name}}");
  });
  it("rejects a source without a default export", async () => {
    await expect(compileReactSource("const x = 1;")).rejects.toThrow("export default");
  });
});
