import { describe, expect, it } from "vitest";
import { letterSrcDoc } from "../src/components/letter-frame";

const CSP = /^<meta http-equiv="Content-Security-Policy" content="([^"]*)">/;
const policy = (doc: string) => doc.match(CSP)?.[1] ?? "";
const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("letterSrcDoc", () => {
  it("puts the policy first and the letter after it", () => {
    const doc = letterSrcDoc("<p>hi</p>", true);
    expect(policy(doc)).not.toBe("");
    expect(doc.endsWith("<p>hi</p>")).toBe(true);
  });

  it.each([true, false])("never allows scripts, frames, forms or media (block=%s)", (block) => {
    const csp = policy(letterSrcDoc("x", block));
    expect(directive(csp, "default-src")).toBe("default-src 'none'");
    expect(csp).not.toContain("script-src");
    expect(directive(csp, "frame-src")).toBe("frame-src 'none'");
    expect(directive(csp, "form-action")).toBe("form-action 'none'");
    expect(directive(csp, "media-src")).toBe("media-src 'none'");
  });

  it("allows no remote load when remote images are blocked", () => {
    expect(policy(letterSrcDoc("x", true))).not.toMatch(/https?:/);
  });

  it("allows https images, styles and fonts, and nothing plain http, when remote images are shown", () => {
    const csp = policy(letterSrcDoc("x", false));
    for (const d of ["img-src", "style-src", "font-src"]) expect(directive(csp, d)).toContain("https:");
    expect(csp).not.toMatch(/\shttp:/);
  });
});
