import { describe, expect, it } from "vitest";
import { parseRoutingInput } from "./streams";

describe("parseRoutingInput", () => {
  it("accepts valid routing", () => {
    expect(parseRoutingInput({ webhook: ["send"], counts: ["open"] })).toEqual({ webhook: ["send"], counts: ["open"] });
    expect(parseRoutingInput({ webhook: [] })).toEqual({ webhook: [] });
  });
  it("rejects unknown type, non-array, non-string entry", () => {
    expect(parseRoutingInput({ webhook: ["nope"] })).toBeNull();
    expect(parseRoutingInput({ webhook: "send" })).toBeNull();
    expect(parseRoutingInput({ webhook: [1] })).toBeNull();
    expect(parseRoutingInput({ webhook: [], counts: "x" })).toBeNull();
    expect(parseRoutingInput(null)).toBeNull();
  });
});
