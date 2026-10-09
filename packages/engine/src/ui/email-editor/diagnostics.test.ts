import { describe, expect, it } from "vitest";
import { editorDiagnostics } from "./diagnostics";

describe("editorDiagnostics", () => {
  it("flags unknown variables at their exact position", () => {
    const doc = "<p>Hi {{contact.first_name}} {{oops}}</p>";
    expect(editorDiagnostics(doc, { language: "html", known: ["contact.first_name"] })).toEqual([
      { from: 29, to: 37, severity: "error", message: "Unknown variable {{oops}} — not available for this email" },
    ]);
  });
  it("turns compatibility findings into line-wide warnings (html only)", () => {
    const doc = '<div>\n<div style="display:flex">x</div>\n</div>';
    const d = editorDiagnostics(doc, { language: "html", known: [] });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ from: 6, to: 39, severity: "warning" });
    expect(editorDiagnostics(doc, { language: "tsx", known: [] })).toEqual([]);
  });
});
