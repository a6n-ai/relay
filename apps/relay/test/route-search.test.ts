import { describe, expect, it } from "vitest";
import { flag, oneOf, posInt, status, str, trimmed } from "../src/components/lib/route-search";

describe("route search parsers", () => {
  it("keeps a non-empty string only", () => {
    expect([str("a"), str(""), str(3), str(undefined)]).toEqual(["a", undefined, undefined, undefined]);
  });
  it("trims a text filter and drops a blank one", () => {
    expect([trimmed("  a b "), trimmed("   "), trimmed(3)]).toEqual(["a b", undefined, undefined]);
  });
  it("reads a URL flag only for the spellings the route lists", () => {
    expect([flag(1, 1, "1"), flag("1", 1, "1"), flag("true", 1, "1"), flag(true, 1, "1"), flag(undefined, 1, "1")]).toEqual([true, true, undefined, undefined, undefined]);
    expect([flag(true, true, "true"), flag("true", true, "true"), flag(1, true, "true"), flag("1", true, "true")]).toEqual([true, true, undefined, undefined]);
  });
  it("keeps a positive number, floored", () => {
    expect([posInt(2.7), posInt(0), posInt(-1), posInt("5")]).toEqual([2, undefined, undefined, undefined]);
  });
  it("keeps a listed value only", () => {
    expect([oneOf(["on", "off"] as const, "on"), oneOf(["on", "off"] as const, "x")]).toEqual(["on", undefined]);
    expect([status("failed"), status("nope")]).toEqual(["failed", undefined]);
  });
});
