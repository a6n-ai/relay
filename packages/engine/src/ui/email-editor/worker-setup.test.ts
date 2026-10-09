import { describe, expect, it } from "vitest";
import { prepareCompileWorker } from "./worker-setup";

describe("prepareCompileWorker", () => {
  it("warms the renderer before locking globals, so lazy chunks load first", async () => {
    const order: string[] = [];
    await prepareCompileWorker({
      warmUp: async () => {
        order.push("warm");
      },
      lock: () => order.push("lock"),
    });
    expect(order).toEqual(["warm", "lock"]);
  });
  it("still locks when the warm-up fails", async () => {
    const order: string[] = [];
    await prepareCompileWorker({
      warmUp: async () => {
        throw new Error("x");
      },
      lock: () => order.push("lock"),
    });
    expect(order).toEqual(["lock"]);
  });
});
