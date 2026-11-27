import { describe, expect, it } from "vitest";
import { errorText } from "../src/components/error-text";

describe("errorText", () => {
  it("maps a known server message to plain copy, not the raw message", () => {
    const text = errorText(new Error("forbidden"));
    expect(text).not.toBe("forbidden");
    expect(text).not.toBe(errorText(new Error("no such message")));
  });

  it("falls back for an unknown message, a prototype key or a non-error, never the raw text", () => {
    const fallback = errorText(null);
    expect(errorText(new Error("forbidden-ish"))).toBe(fallback);
    expect(errorText(new Error("constructor"))).toBe(fallback);
    expect(errorText("forbidden")).toBe(fallback);
    expect(errorText(new Error("forbidden-ish"), "Could not save.")).toBe("Could not save.");
  });
});
