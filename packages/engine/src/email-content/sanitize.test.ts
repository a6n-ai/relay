import { describe, expect, it } from "vitest";
import { sanitizeEmailHtml } from "./sanitize";

const LEGIT = `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head><meta charset="UTF-8"><style>@media (max-width:600px){.x{padding:0 !important}}</style>
<!--[if mso]><style>td{font-family:Arial !important}</style><![endif]--></head>
<body style="margin:0"><div style='display:none;font-family:"Poppins"'>Save &#847;&zwnj;&nbsp;</div>
<table role="presentation"><tr><td><a href="https://app.tiffingrab.ca/subscribe?a=1&amp;b=2">Go</a>
<a href="mailto:hi@x.ca">Mail</a><a href="{{contact.url|https://x.ca}}">Var</a><img src="data:image/png;base64,AAA" alt=""><br/></td></tr></table></body></html>`;

describe("sanitizeEmailHtml", () => {
  it("keeps legitimate email markup untouched", () => {
    const out = sanitizeEmailHtml(LEGIT);
    expect(out.removed).toEqual([]);
    for (const s of [
      "<!DOCTYPE html>",
      "<!--[if mso]>",
      "<![endif]-->",
      "@media (max-width:600px)",
      "&#847;&zwnj;&nbsp;",
      "font-family:&quot;Poppins&quot;",
      "a=1&amp;b=2",
      "mailto:hi@x.ca",
      "{{contact.url|https://x.ca}}",
      "data:image/png;base64,AAA",
    ]) {
      expect(out.html).toContain(s);
    }
  });

  it("removes scripts, embeds and forms", () => {
    const out = sanitizeEmailHtml(
      `<p>a</p><script>alert(1)</script><iframe src="x"></iframe><object></object><embed><form action="/x"><input></form><base href="https://evil">`,
    );
    expect(out.html).toBe("<p>a</p>");
    expect(out.removed).toEqual(["<script>", "<iframe>", "<object>", "<embed>", "<form>", "<base>"]);
  });

  it("removes event handler and srcdoc attributes", () => {
    const out = sanitizeEmailHtml(`<a href="https://x.ca" onclick="x()" onMouseOver="y()">x</a><div srcdoc="z">d</div>`);
    expect(out.html).toBe(`<a href="https://x.ca">x</a><div>d</div>`);
    expect(out.removed).toEqual(["onclick on <a>", "onMouseOver on <a>", "srcdoc on <div>"]);
  });

  it("removes obfuscated script URLs", () => {
    for (const href of ["JaVaScRiPt:alert(1)", " javascript:x", "java\tscript:x", "&#106;avascript:x", "vbscript:x", "data:text/html,<b>"]) {
      const out = sanitizeEmailHtml(`<a href="${href}">x</a>`);
      expect(out.html).toBe("<a>x</a>");
      expect(out.removed).toEqual(["unsafe href on <a>"]);
    }
  });

  it("removes a data: image that isn't an image", () => {
    expect(sanitizeEmailHtml(`<img src="data:text/html;base64,AA">`).html).toBe("<img>");
  });

  it("drops style attributes using expression() or script URLs", () => {
    expect(sanitizeEmailHtml(`<p style="width:expression(alert(1))">x</p>`).html).toBe("<p>x</p>");
  });

  it("keeps Google Fonts stylesheet links but drops other links", () => {
    const out = sanitizeEmailHtml(
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins"><link rel="stylesheet" href="https://evil.example/x.css">`,
    );
    expect(out.html).toContain("fonts.googleapis.com");
    expect(out.html).not.toContain("evil.example");
    expect(out.removed).toEqual(["<link>"]);
  });

  it("decodes named entities before checking URLs (&colon; &Tab; &NewLine;)", () => {
    for (const href of ["javascript&colon;alert(1)", "java&Tab;script:x", "java&NewLine;script:x", "&#x6A;avascript:x", "&#106avascript:x"]) {
      expect(sanitizeEmailHtml(`<a href="${href}">x</a>`).html).toBe("<a>x</a>");
    }
  });

  it("drops a comment the browser would close early at --!>", () => {
    const out = sanitizeEmailHtml("<p>a</p><!-- --!><img src=x onerror=alert(1)> -->");
    expect(out.html).not.toContain("onerror");
    expect(out.removed).toContain("<!-- --!> comment");
  });

  it("drops raw-text containers browsers parse differently (noscript, xmp, template…)", () => {
    const out = sanitizeEmailHtml('<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript><xmp>x</xmp><template>t</template>');
    expect(out.html).not.toMatch(/onerror|noscript|xmp|template/);
  });

  it("drops style, title and foreignObject inside svg/math, where browsers parse markup", () => {
    const out = sanitizeEmailHtml(
      "<svg><style><img src=x onerror=alert(1)></style><title><img src=x onerror=alert(2)></title><foreignObject><p>x</p></foreignObject><rect/></svg><math><style>y</style></math>",
    );
    expect(out.html).not.toMatch(/onerror|<style|<title|foreignObject/i);
    expect(out.html).toContain("<rect");
  });
});
