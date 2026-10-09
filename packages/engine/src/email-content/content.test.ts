import { describe, expect, it } from "vitest";
import { CAMPAIGN_VARIABLES, findUnknownVariables, htmlToText, prepareEmailContent, variableTokens } from "./index";
import { readPreheader } from "../preheader";

describe("htmlToText", () => {
  it("drops style blocks and tags, collapses whitespace, decodes nbsp", () => {
    expect(htmlToText("<style>p{x:y}</style><p>Hi&nbsp;there</p>\n<p>Bye</p>")).toBe("Hi there Bye");
  });
});

describe("variables", () => {
  it("finds tokens with positions, including fallbacks", () => {
    expect(variableTokens("Hi {{contact.first_name|there}}!")).toEqual([{ key: "contact.first_name", from: 3, to: 31 }]);
  });
  it("lists unknown keys once, in order", () => {
    expect(findUnknownVariables("{{a.b}} {{contact.name}} {{a.b}} {{c}}", CAMPAIGN_VARIABLES)).toEqual(["a.b", "c"]);
  });
});

describe("prepareEmailContent", () => {
  const base = { subject: "Hi {{contact.first_name}}", source: "", known: CAMPAIGN_VARIABLES };
  it("sanitizes, adds the preheader and generates text", () => {
    const out = prepareEmailContent({ ...base, html: '<html><body><p onclick="x()">Hello</p></body></html>', preheader: "Save $65" });
    expect(out.html).not.toContain("onclick");
    expect(readPreheader(out.html)).toBe("Save $65");
    expect(out.text).toContain("Hello");
    expect(out.removed).toEqual(["onclick on <p>"]);
    expect(out.unknownVariables).toEqual([]);
  });
  it("reports unknown variables from subject, source and html", () => {
    const out = prepareEmailContent({
      ...base,
      subject: "{{oops}}",
      source: "/*react-email*/{{src.x}}",
      html: "<p>{{h.y}}</p>",
      preheader: "",
    });
    expect(out.unknownVariables).toEqual(["oops", "src.x", "h.y"]);
  });
});
