import { describe, expect, it } from "vitest";
import { emailHtmlToReader, emailTextToReader } from "./reader";

const FORBIDDEN = [/<script/i, /\bon\w+\s*=/i, /javascript:/i, /style\s*=/i, /<img/i, /<iframe/i, /<svg/i, /<style/i];

const GMAIL = `<html><head><style>.x{color:red}</style></head><body><div dir="ltr">hello<br clear="all"><div><br></div><span class="gmail_signature_prefix">-- </span><br><div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature"><div dir="ltr">Ada Lovelace<br>Engineering</div></div></div><br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On Mon, Bob wrote:<br></div><blockquote class="gmail_quote" style="margin:0 0 0 .8ex"><div dir="ltr">earlier question</div></blockquote></div></body></html>`;

describe("emailHtmlToReader", () => {
  it("splits a Gmail reply into body, signature and quoted", () => {
    const r = emailHtmlToReader(GMAIL);
    expect(r.body).toBe("<div>hello</div>");
    expect(r.signature).toContain("Engineering");
    expect(r.signature).not.toContain("gmail_signature");
    expect(r.quoted).toContain("earlier question");
    expect(r.body).not.toContain("earlier");
    expect(r.body).not.toContain("Engineering");
    expect(r.body).not.toContain("color:red");
  });

  it("cuts Outlook reply sections and everything after", () => {
    const r = emailHtmlToReader(`<div>hi</div><div id="appendonsend"></div><hr><div id="divRplyFwdMsg">From: x</div><p>old</p>`);
    expect(r.body).toBe("<div>hi</div>");
    expect(r.quoted).toContain("old");
  });

  it("detects a '-- ' text signature div", () => {
    const r = emailHtmlToReader(`<div>hi</div><div>-- <br>Bob</div>`);
    expect(r.body).toBe("<div>hi</div>");
    expect(r.signature).toContain("Bob");
  });

  const attacks: [string, string, string][] = [
    ["js href", `<a href="javascript:alert(1)">keep</a>`, "keep"],
    ["entity-obfuscated href", `<a href="jav&#x09;ascript:alert(1)">keep</a>`, "keep"],
    ["named-entity href", `<a href="javascript&colon;alert(1)">keep</a>`, "keep"],
    ["data href", `<a href="data:text/html,<script>alert(1)</script>">keep</a>`, "keep"],
    ["img onerror", `<img src=x onerror=alert(1)>keep`, "keep"],
    ["svg script", `<svg><script>alert(1)</script></svg>keep`, "keep"],
    ["style tag", `<style>body{display:none}</style>keep`, "keep"],
    ["inline style", `<div style="position:fixed">keep</div>`, "keep"],
    ["math", `<math><mi xlink:href="javascript:alert(1)">x</mi></math>keep`, "keep"],
    ["comment", `<!--><script>-->keep`, ""],
    ["iframe", `<iframe src="https://evil"></iframe>keep`, "keep"],
    ["event attr on kept tag", `<p onclick="alert(1)" class="a" id="b">keep</p>`, "keep"],
    ["escaped text stays text", `<p>&lt;script&gt;alert(1)&lt;/script&gt; keep</p>`, "keep"],
  ];
  it.each(attacks)("neutralises %s", (_name, html, text) => {
    const r = emailHtmlToReader(html);
    const out = `${r.body}${r.quoted ?? ""}${r.signature ?? ""}`;
    for (const re of FORBIDDEN) expect(out).not.toMatch(re);
    expect(out).toContain(text);
  });

  it("keeps safe links with hardened attributes and replaces img with alt text", () => {
    const r = emailHtmlToReader(`<a href="https://a.test/x?a=1&b=2" onclick="x">go</a><img src="https://t/p.gif" alt="logo"><img src="y">`);
    expect(r.body).toBe(
      `<a href="https://a.test/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer nofollow">go</a>[logo]`,
    );
    expect(emailHtmlToReader(`<a href="mailto:a@b.test">m</a>`).body).toContain('href="mailto:a@b.test"');
  });

  it("unwraps unknown tags and keeps only digit colspan", () => {
    const r = emailHtmlToReader(`<center><table><tr><td colspan="2" rowspan="x">c</td></tr></table></center>`);
    expect(r.body).toBe(`<table><tr><td colspan="2">c</td></tr></table>`);
  });
});

describe("emailTextToReader", () => {
  it("splits On...wrote: quoting", () => {
    const r = emailTextToReader("hello\n\nOn Mon, Bob wrote:\n> earlier\n> more");
    expect(r.body).toBe("hello");
    expect(r.quoted).toContain("earlier");
    expect(r.quoted).not.toContain("&gt;");
  });

  it("splits a bare > run", () => {
    const r = emailTextToReader("hi\n> quoted");
    expect(r.body).toBe("hi");
    expect(r.quoted).toBe("quoted");
  });

  it("splits '-- ' signature", () => {
    const r = emailTextToReader("hi\nthere\n-- \nBob\nEng");
    expect(r.body).toBe("hi<br>there");
    expect(r.signature).toBe("Bob<br>Eng");
    expect(emailTextToReader("hi\n--\nBob").signature).toBe("Bob");
  });

  it("links URLs and escapes markup", () => {
    const r = emailTextToReader(`<b>x</b> see https://a.test/p?a=1&b=2. "ok"`);
    expect(r.body).toBe(
      `&lt;b&gt;x&lt;/b&gt; see <a href="https://a.test/p?a=1&amp;b=2" target="_blank" rel="noopener noreferrer nofollow">https://a.test/p?a=1&amp;b=2</a>. &quot;ok&quot;`,
    );
    expect(r.body).not.toContain("<b>");
    expect(r.quoted).toBeNull();
    expect(r.signature).toBeNull();
  });
});
