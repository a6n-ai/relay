import { describe, expect, it } from "vitest";
import { isTypingTarget } from "../src/components/page/keys";

describe("isTypingTarget", () => {
  it("is true for form fields and editable content", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("is false for other elements and null", () => {
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
