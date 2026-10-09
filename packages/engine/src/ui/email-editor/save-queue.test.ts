import { describe, expect, it } from "vitest";
import { createSaveQueue } from "./autosave";

describe("createSaveQueue", () => {
  it("never runs two saves at once; a call during a save runs once afterwards", async () => {
    let running = 0;
    let maxRunning = 0;
    let calls = 0;
    const release: (() => void)[] = [];
    const q = createSaveQueue(async () => {
      calls++;
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise<void>((r) => release.push(r));
      running--;
      return "ok" as const;
    });
    const a = q.run();
    const b = q.run();
    const c = q.run(); // coalesces with b
    expect(calls).toBe(1);
    release.shift()!();
    await a;
    await Promise.resolve();
    expect(calls).toBe(2);
    release.shift()!();
    await Promise.all([b, c]);
    expect(calls).toBe(2);
    expect(maxRunning).toBe(1);
  });
});
