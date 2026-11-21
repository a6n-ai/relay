import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/email/provider", () => ({ getEmailProvider: () => ({ send: h.send }) }));

const { sendInviteEmail } = await import("./security-events");

describe("sendInviteEmail", () => {
  beforeEach(() => h.send.mockReset().mockResolvedValue(undefined));

  it("invite email escapes markdown links in names", async () => {
    await sendInviteEmail({
      email: "ana@example.test",
      workspaceName: "[x](https://evil.example)",
      inviterName: "[y](https://evil.example)",
      url: "https://relay.example/accept-invitation/inv_1",
    });
    const { html, text } = h.send.mock.calls[0][0];
    expect(html).not.toContain('href="https://evil.example');
    expect(text).not.toContain("](https://evil.example)");
    expect(html).toContain("accept-invitation/inv_1");
  });

  it("invite email shows punctuation in plain names as typed", async () => {
    await sendInviteEmail({
      email: "ana@example.test",
      workspaceName: "Acme (EU) & Co.",
      inviterName: "Olive",
      url: "https://relay.example/accept-invitation/inv_1",
    });
    expect(h.send.mock.calls[0][0].text).toContain("join Acme (EU) & Co.");
  });
});
