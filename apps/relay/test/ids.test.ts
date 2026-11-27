import { describe, expect, it } from "vitest";
import { newId } from "../src/lib/ids";

describe("newId", () => {
  it("returns prefix_ followed by 12 url-safe characters", () => {
    expect(newId("msg")).toMatch(/^msg_[0-9A-Za-z_-]{12}$/);
  });

  it("rejects prefixes that are not exactly 3 lowercase letters", () => {
    expect(() => newId("MS")).toThrow("id prefix must be exactly 3 lowercase letters");
  });

  it("does not repeat across 1000 calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId("msg")));
    expect(ids.size).toBe(1000);
  });
});
