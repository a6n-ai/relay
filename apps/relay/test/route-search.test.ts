import { describe, expect, it } from "vitest";
import { oneOf, posInt, status, str } from "../src/components/lib/route-search";

describe("route search parsers", () => {
  it("keeps a non-empty string only", () => {
    expect([str("a"), str(""), str(3), str(undefined)]).toEqual(["a", undefined, undefined, undefined]);
  });
  it("keeps a positive number, floored", () => {
    expect([posInt(2.7), posInt(0), posInt(-1), posInt("5")]).toEqual([2, undefined, undefined, undefined]);
  });
  it("keeps a listed value only", () => {
    expect([oneOf(["on", "off"] as const, "on"), oneOf(["on", "off"] as const, "x")]).toEqual(["on", undefined]);
    expect([status("failed"), status("nope")]).toEqual(["failed", undefined]);
  });
});
