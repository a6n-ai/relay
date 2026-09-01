import { describe, expect, it } from "vitest";
import { coerceBigints, diffChanges, jsonSafe } from "./diff";

describe("diffChanges", () => {
  it("records only keys present in the patch that actually changed", () => {
    expect(
      diffChanges({ host: "old", port: 25 }, { host: "new", port: 25 }, { host: "new" }),
    ).toEqual({ host: { from: "old", to: "new" } });
  });

  it("returns null when the patch is a no-op", () => {
    expect(diffChanges({ host: "a" }, { host: "a" }, { host: "a" })).toBeNull();
  });

  it("treats missing before as from undefined", () => {
    expect(diffChanges(null, { host: "smtp.example" }, { host: "smtp.example" })).toEqual({
      host: { from: undefined, to: "smtp.example" },
    });
  });
});

describe("jsonSafe", () => {
  it("stringifies nested bigints so audit_log JSON can store them", () => {
    expect(jsonSafe({ id: 1n, nested: { n: 2n }, list: [3n] })).toEqual({
      id: "1",
      nested: { n: "2" },
      list: ["3"],
    });
  });

  it("passes null through", () => {
    expect(jsonSafe(null)).toBeNull();
  });

  it("leaves primitives other than bigint alone", () => {
    expect(coerceBigints("x")).toBe("x");
    expect(coerceBigints(1)).toBe(1);
  });
});
