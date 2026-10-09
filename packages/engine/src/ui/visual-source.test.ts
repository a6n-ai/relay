import { describe, expect, it } from "vitest";
import { parseVisualSource, toVisualSource, VISUAL_SOURCE_MARKER } from "./visual-source";
import { initialEmailMode } from "./email-content-editor";

const DOC = "<!DOCTYPE html><html><body><p>Hi</p></body></html>";
const JSON_DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] };

describe("visual source", () => {
  it("round-trips the editor's JSON document", () => {
    expect(parseVisualSource(toVisualSource(JSON_DOC))).toEqual(JSON_DOC);
  });

  it("is not visual source without the marker", () => {
    expect(parseVisualSource(DOC)).toBeNull();
  });

  it("treats a corrupt payload as not visual source", () => {
    expect(parseVisualSource(`${VISUAL_SOURCE_MARKER}{not json`)).toBeNull();
  });

  it("reopens a visual-authored email in Visual even though html is a full document", () => {
    expect(initialEmailMode(toVisualSource(JSON_DOC), DOC)).toBe("visual");
  });
});
