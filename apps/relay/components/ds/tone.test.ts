import { describe, expect, it } from "vitest";
import { splitDelta } from "./tone";

describe("splitDelta", () => {
  it.each([
    ["+12%", "up", "12%"],
    ["-3%", "down", "3%"],
    ["−0.4%", "down", "0.4%"],
    ["0%", null, "0%"],
    ["clear", null, "clear"],
  ])("%s → %s %s", (label, dir, text) => {
    expect(splitDelta(label)).toEqual({ dir, text });
  });
});
