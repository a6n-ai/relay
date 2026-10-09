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

interface Booted {
  worker: WorkerLike;
  ready: Promise<void>;
}

/**
 * Compiles React email source in a dedicated worker. The `timeoutMs` render limit
 * starts only once the worker says it is ready — chunk download and warm-up on a
 * cold start are not an endless loop. A worker that never gets ready fails after `bootTimeoutMs`.
 */
export function createReactCompiler({
  spawn = spawnWorker,
  timeoutMs = 2000,
  bootTimeoutMs = 30_000,
}: { spawn?: () => WorkerLike; timeoutMs?: number; bootTimeoutMs?: number } = {}) {
  let booted: Booted | undefined;
  let seq = 0;

  const boot = (): Booted => {
    const worker = spawn();
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.removeEventListener("message", onReady);
        reject(new Error("Couldn't start the template renderer — reload the page and try again"));
      }, bootTimeoutMs);
      function onReady(e: { data: { ready?: boolean } }) {
        if (!e.data?.ready) return;
        clearTimeout(timer);
        worker.removeEventListener("message", onReady);
        resolve();
      }
      worker.addEventListener("message", onReady);
    });
    return { worker, ready };
  };

  const kill = (b: Booted) => {
    b.worker.terminate();
    if (booted === b) booted = undefined;
  };

  return {
    async compile(source: string): Promise<string> {
      booted ??= boot();
      const b = booted;
      try {
        await b.ready;
      } catch (e) {
        kill(b);
        throw e;
      }
      const w = b.worker;
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          w.removeEventListener("message", onMessage);
          kill(b);
          reject(new Error(`Template took longer than ${timeoutMs / 1000}s to render — check for an endless loop`));
        }, timeoutMs);
        function onMessage(e: { data: { id?: number; html?: string; error?: string } }) {
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
      if (booted) kill(booted);
    },
  };
}
