import { describe, expect, it, vi } from "vitest";
import { createReactCompiler, type WorkerLike } from "./react-compiler";
import { compileReactSource } from "../react-template";

function fakeWorker(reply?: (m: { id: number; source: string }) => unknown) {
  const listeners = new Set<(e: { data: unknown }) => void>();
  const w: WorkerLike & { terminated: boolean } = {
    terminated: false,
    postMessage: (m) => {
      if (reply) queueMicrotask(() => listeners.forEach((f) => f({ data: reply(m as { id: number; source: string }) })));
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
    vi.advanceTimersByTime(2001);
    await expect(p).rejects.toThrow("took longer than 2s");
    expect(workers[0]!.terminated).toBe(true);
    void c.compile("x").catch(() => {});
    expect(workers).toHaveLength(2);
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
