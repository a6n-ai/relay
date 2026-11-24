import { describe, expect, it } from "vitest";
import { letterSrcDoc } from "../src/components/letter-frame";

const CSP = /^<meta http-equiv="Content-Security-Policy" content="([^"]*)">/;

describe("letterSrcDoc", () => {
  it("blocks remote loads first in the document when remote images are blocked", () => {
    const doc = letterSrcDoc("<p>hi</p>", true);
    expect(doc.match(CSP)?.[1]).toBe(
      "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:; media-src 'none'; frame-src 'none'; form-action 'none'",
    );
    expect(doc.endsWith("<p>hi</p>")).toBe(true);
  });

  it("allows https images, styles and fonts when remote images are shown", () => {
    const doc = letterSrcDoc("<p>hi</p>", false);
    expect(doc.match(CSP)?.[1]).toBe(
      "default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https:; font-src data: https:; media-src 'none'; frame-src 'none'; form-action 'none'",
    );
    expect(doc.endsWith("<p>hi</p>")).toBe(true);
  });
});
