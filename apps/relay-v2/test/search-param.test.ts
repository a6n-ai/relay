import { describe, expect, it } from "vitest";
import { withParam } from "../src/components/page/search-param";

describe("withParam", () => {
  it("sets the key and keeps other params", () => {
    expect(withParam({ appId: "a", cursor: "c" }, "q", "x", false)).toEqual({ appId: "a", cursor: "c", q: "x" });
  });
  it("drops the cursor when resetting", () => {
    expect(withParam({ appId: "a", cursor: "c", email: "old" }, "email", "x", true)).toEqual({ appId: "a", email: "x" });
    expect(withParam({ appId: "a", cursor: "c", offset: 50 }, "q", "x", true)).toEqual({ appId: "a", q: "x" });
  });
  it("trims and removes an empty value", () => {
    expect(withParam({ q: "old", dir: "in" }, "q", "  ", true)).toEqual({ dir: "in" });
  });
  it("does not add an undefined cursor key", () => {
    expect(withParam({}, "q", "x", false)).toEqual({ q: "x" });
  });
});
