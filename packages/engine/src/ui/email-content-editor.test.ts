import { describe, expect, it } from "vitest";
import { initialEmailMode } from "./email-content-editor";
import { REACT_SOURCE_MARKER } from "./react-template";
import { withPreheader } from "../preheader";

const DOC = "<!DOCTYPE html><html><body><table><tr><td>Hi</td></tr></table></body></html>";

describe("initialEmailMode", () => {
  it("opens HTML for a saved document", () => expect(initialEmailMode(DOC, DOC)).toBe("html"));
  it("opens HTML for seeded content with no body", () => expect(initialEmailMode("", DOC)).toBe("html"));
  it("opens HTML for a brand-new email", () => expect(initialEmailMode("", "")).toBe("html"));
  it("opens React for react-authored content", () =>
    expect(initialEmailMode(`${REACT_SOURCE_MARKER}export default () => null`, DOC)).toBe("react"));
  it("opens old Visual-editor rows in HTML (their html is the composed email)", () => {
    expect(initialEmailMode('/*email-editor-json*/{"type":"doc"}', DOC)).toBe("html");
    expect(initialEmailMode("<p>Hi {{name}}</p>", DOC)).toBe("html");
  });
  it("opens HTML for a saved document that carries our preheader", () => {
    const doc = withPreheader(DOC, "Save $65");
    expect(initialEmailMode(doc, doc)).toBe("html");
  });
});
