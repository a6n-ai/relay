import { describe, expect, it } from "vitest";
import { appendUnsubscribeFooter } from "./template";

describe("appendUnsubscribeFooter", () => {
  const footer = {
    url: "https://x.test/unsubscribe?address=a",
    sender: "Puchkaman",
    address: "1 Main St, Toronto ON",
  };

  it("appends an unsubscribe link and the sender's postal address to html", () => {
    const out = appendUnsubscribeFooter({ html: "<p>hi</p>", text: "hi" }, footer);
    expect(out.html).toContain(footer.url);
    expect(out.html).toContain("1 Main St, Toronto ON");
    expect(out.html).toContain("<p>hi</p>");
  });

  it("lands inside <body> of a full html document, not after </html>", () => {
    const doc = "<!DOCTYPE html><html><head></head><body style=\"background:#fff\"><table><tr><td>hi</td></tr></table></BODY>\n</html>";
    const out = appendUnsubscribeFooter({ html: doc, text: "hi" }, footer);
    const unsub = out.html.indexOf(footer.url);
    expect(unsub).toBeGreaterThan(out.html.indexOf("<td>hi</td>"));
    expect(unsub).toBeLessThan(out.html.indexOf("</BODY>"));
    expect(out.html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("appends the same information to the plaintext part", () => {
    const out = appendUnsubscribeFooter({ html: "<p>hi</p>", text: "hi" }, footer);
    expect(out.text).toContain(footer.url);
    expect(out.text).toContain("Puchkaman");
  });

  it("does not double-append when a footer is already present", () => {
    const once = appendUnsubscribeFooter({ html: "<p>hi</p>", text: "hi" }, footer);
    const twice = appendUnsubscribeFooter(once, footer);
    expect(twice.html.match(/unsubscribe\?address=a/g)).toHaveLength(1);
  });

  it("escapes a sender name that contains markup", () => {
    const out = appendUnsubscribeFooter(
      { html: "<p>hi</p>", text: "hi" },
      { ...footer, sender: '<script>alert(1)</script>' },
    );
    expect(out.html).not.toContain("<script>");
  });
});
