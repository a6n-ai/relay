import { describe, expect, it } from "vitest";
import { pickTemplate, renderEmailForEvent, type TemplateRow } from "./template";

const row = (over: Partial<TemplateRow>): TemplateRow => ({
  channel: "email", locale: "en", subject: "s", body: null, html: "<p>h</p>",
  text: "t", providerTemplateId: null, enabled: true, ...over,
});

describe("pickTemplate", () => {
  it("returns null when no row matches the channel", () => {
    expect(pickTemplate([row({ channel: "in_app" })], "email", "en")).toBeNull();
  });

  it("ignores disabled rows", () => {
    expect(pickTemplate([row({ enabled: false })], "email", "en")).toBeNull();
  });

  it("prefers the requested locale", () => {
    const rows = [row({ locale: "en", subject: "english" }), row({ locale: "fr", subject: "french" })];
    expect(pickTemplate(rows, "email", "fr")!.subject).toBe("french");
  });

  it("falls back to en when the requested locale is absent", () => {
    const rows = [row({ locale: "en", subject: "english" })];
    expect(pickTemplate(rows, "email", "fr")!.subject).toBe("english");
  });
});

describe("renderEmailForEvent escaping", () => {
  const row = { channel: "email", locale: "en", subject: "Hi {{user.name}}", body: null, html: "<p>Hi {{user.name}}, note: {{order.note}}</p>", text: "Hi {{user.name}} {{order.note}}", providerTemplateId: null, enabled: true };
  const fakeDb = { select: () => ({ from: () => ({ where: () => Promise.resolve([row]) }) }) };
  const fakeTables = { notificationTemplate: { event: "event" } };

  it("escapes var values in html only, keeping subject and text raw", async () => {
    const out = await renderEmailForEvent(fakeDb as never, fakeTables as never, "order_created", "en", {
      user: { name: '<script>x</script>' },
      order: { note: '"><img src=x onerror=1>' },
    });
    expect(out?.html).toBe("<p>Hi &lt;script&gt;x&lt;/script&gt;, note: &quot;&gt;&lt;img src=x onerror=1&gt;</p>");
    expect(out?.subject).toBe("Hi <script>x</script>");
    expect(out?.text).toBe('Hi <script>x</script> "><img src=x onerror=1>');
  });

  it("leaves numbers and plain text unchanged", async () => {
    const out = await renderEmailForEvent(fakeDb as never, fakeTables as never, "order_created", "en", { user: { name: "Asha" }, order: { note: 12.5 } });
    expect(out?.html).toBe("<p>Hi Asha, note: 12.5</p>");
  });
});
