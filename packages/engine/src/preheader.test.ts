import { describe, expect, it } from "vitest";
import { readPreheader, withPreheader } from "./preheader";

const DOC = '<!DOCTYPE html><html><head></head><body style="margin:0"><p>Hi</p></body></html>';

describe("preheader", () => {
  it("injects right after <body>", () => {
    const out = withPreheader(DOC, "Save $65 this weekend");
    expect(out.indexOf("data-relay-preheader")).toBeGreaterThan(out.indexOf("<body"));
    expect(out.indexOf("data-relay-preheader")).toBeLessThan(out.indexOf("<p>Hi</p>"));
    expect(readPreheader(out)).toBe("Save $65 this weekend");
  });

  it("replaces its own preheader instead of adding a second", () => {
    const once = withPreheader(DOC, "first");
    const twice = withPreheader(once, "second");
    expect(twice.match(/data-relay-preheader/g)).toHaveLength(1);
    expect(readPreheader(twice)).toBe("second");
  });

  it("leaves a hand-written preheader alone", () => {
    const own = DOC.replace("<p>Hi</p>", '<div style="display:none">their own</div><p>Hi</p>');
    const out = withPreheader(own, "ours");
    expect(out).toContain("their own");
    expect(readPreheader(out)).toBe("ours");
  });

  it("removes ours when text is blank", () => {
    expect(withPreheader(withPreheader(DOC, "x"), "  ")).not.toContain("data-relay-preheader");
  });

  it("escapes markup in the text", () => {
    const out = withPreheader(DOC, `5 < 6 & "quotes"`);
    expect(out).toContain("5 &lt; 6 &amp; &quot;quotes&quot;");
    expect(readPreheader(out)).toBe(`5 < 6 & "quotes"`);
  });

  it("prepends when there is no <body> (a fragment)", () => {
    expect(withPreheader("<p>Hi</p>", "x").startsWith("<div data-relay-preheader")).toBe(true);
  });

  it("reads nothing from html without one", () => {
    expect(readPreheader(DOC)).toBe("");
  });
});
