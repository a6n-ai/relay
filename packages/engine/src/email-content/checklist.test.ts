import { describe, expect, it } from "vitest";
import { campaignChecklist, imagesMissingAlt, invalidLinks } from "./checklist";
import { CAMPAIGN_VARIABLES } from "./variables";
import { withPreheader } from "../preheader";

const ok = {
  channel: "email",
  subject: "Hi {{contact.first_name|there}}",
  html: withPreheader('<html><body><p>Hello</p><a href="https://app.tiffingrab.ca/subscribe">Go</a></body></html>', "Save $65"),
  body: null,
  footerConfigured: true,
  eligible: 12,
  known: CAMPAIGN_VARIABLES,
};
const codes = (items: { code: string }[]) => items.map((i) => i.code);

describe("invalidLinks", () => {
  it("accepts web, mail, phone and variable links; rejects the rest", () => {
    const html =
      '<a href="https://x.ca">a</a><a href="mailto:a@x.ca">b</a><a href="tel:+1416">c</a><a href="{{contact.url|https://x.ca}}">d</a>' +
      '<a href="www.example.com">e</a><a href="#">f</a><a href="">g</a><a>h</a>';
    expect(invalidLinks(html)).toEqual(["www.example.com", "#", ""]);
  });
});

describe("imagesMissingAlt", () => {
  it("counts images with no alt attribute; an empty alt is a deliberate decorative image", () => {
    expect(imagesMissingAlt('<img src="a.png"><img src="b.png" alt=""><img src="c.png" alt="Logo">')).toBe(1);
  });
});

describe("campaignChecklist", () => {
  it("passes a complete email with no blocking items or warnings", () => {
    expect(campaignChecklist(ok)).toEqual({ blocking: [], warnings: [] });
  });

  it("blocks on every missing essential", () => {
    const out = campaignChecklist({
      ...ok,
      subject: "  ",
      html: '<p>{{oops}}</p><a href="www.x.com">x</a>',
      footerConfigured: false,
      eligible: 0,
    });
    expect(codes(out.blocking)).toEqual(["subject", "footer", "links", "variables", "recipients"]);
  });

  it("blocks an email with no content", () => {
    expect(codes(campaignChecklist({ ...ok, html: "" }).blocking)).toContain("content");
  });

  it("warns without blocking for preview text, alt text and compatibility", () => {
    const out = campaignChecklist({
      ...ok,
      html: '<html><body><div style="display:flex"><img src="a.png"></div><a href="https://x.ca">x</a></body></html>',
    });
    expect(out.blocking).toEqual([]);
    expect(codes(out.warnings)).toEqual(["preheader", "alt", "compat"]);
  });

  it("checks sms/whatsapp for a body instead of html and skips email-only rules", () => {
    const sms = { ...ok, channel: "sms", html: null, body: "Hi {{contact.first_name}}", footerConfigured: false };
    expect(campaignChecklist(sms)).toEqual({ blocking: [], warnings: [] });
    expect(codes(campaignChecklist({ ...sms, body: "" }).blocking)).toEqual(["content"]);
  });
});
