import { afterEach, describe, expect, it, vi } from "vitest";
import { createWake, wakeId } from "./wake.js";

afterEach(() => vi.restoreAllMocks());

describe("createWake", () => {
  it("creates an instance with a minute-rounded id", async () => {
    const create = vi.fn();
    await createWake({ create }, "wake", 120_001);
    expect(wakeId("wake", 120_001)).toBe("wake-180000");
    expect(create).toHaveBeenCalledWith({ id: "wake-180000", params: { at: 120_001 } });
  });

  it("swallows a duplicate id silently", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await createWake({ create: async () => { throw new Error("instance.already_exists"); } }, "wake", 1);
    expect(err).not.toHaveBeenCalled();
  });

  it("logs other errors without throwing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await createWake({ create: async () => { throw new Error("boom"); } }, "wake", 1);
    expect(err).toHaveBeenCalled();
  });
});
