"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- worker message payloads */
export interface WorkerLike {
  postMessage(m: unknown): void;
  addEventListener(t: "message", f: (e: { data: any }) => void): void;
  removeEventListener(t: "message", f: (e: { data: any }) => void): void;
  terminate(): void;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const spawnWorker = (): WorkerLike =>
  new Worker(new URL("./react-compile.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;

/** Compiles React email source in a dedicated worker; a render that runs past `timeoutMs` kills the worker. */
export function createReactCompiler({ spawn = spawnWorker, timeoutMs = 2000 }: { spawn?: () => WorkerLike; timeoutMs?: number } = {}) {
  let worker: WorkerLike | undefined;
  let seq = 0;
  return {
    compile(source: string): Promise<string> {
      worker ??= spawn();
      const w = worker;
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          w.removeEventListener("message", onMessage);
          w.terminate();
          if (worker === w) worker = undefined;
          reject(new Error(`Template took longer than ${timeoutMs / 1000}s to render — check for an endless loop`));
        }, timeoutMs);
        function onMessage(e: { data: { id: number; html?: string; error?: string } }) {
          if (e.data.id !== id) return;
          clearTimeout(timer);
          w.removeEventListener("message", onMessage);
          if (e.data.error !== undefined) reject(new Error(e.data.error));
          else resolve(e.data.html ?? "");
        }
        w.addEventListener("message", onMessage);
        w.postMessage({ id, source });
      });
    },
    dispose() {
      worker?.terminate();
      worker = undefined;
    },
  };
}
