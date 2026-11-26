import { describe, expect, it } from "vitest";
import { isDocsMiss } from "../src/docs-404";

describe("isDocsMiss", () => {
  it("matches a 404 under /docs", () => {
    expect(isDocsMiss("/docs", 404)).toBe(true);
    expect(isDocsMiss("/docs/missing-page", 404)).toBe(true);
  });
  it("ignores non-404 and non-docs paths", () => {
    expect(isDocsMiss("/docs/api/messages/", 200)).toBe(false);
    expect(isDocsMiss("/docs-other", 404)).toBe(false);
    expect(isDocsMiss("/campaigns", 404)).toBe(false);
  });
});
