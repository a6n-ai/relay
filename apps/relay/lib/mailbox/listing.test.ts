import { describe, expect, it } from "vitest";
import type { MailboxDirection, MailboxOrigin } from "@relay/engine";
import { toMailboxListingRow } from "./listing";
import { templateTestMailboxLetter } from "./template-test";

const origins: MailboxOrigin[] = ["automatic", "campaign", "test"];
const directions: MailboxDirection[] = ["out"];

describe("toMailboxListingRow", () => {
  it("maps each origin × failed/not onto filterKeys without putting HTML in search", () => {
    for (const origin of origins) {
      for (const direction of directions) {
        for (const failed of [false, true]) {
          const row = toMailboxListingRow({
            publicId: "mbx_1",
            subject: "Order ready",
            fromEmail: "ops@relay.local",
            fromName: "Relay",
            toEmail: "a@b.com",
            tenantName: "Demo",
            status: failed ? "failed" : "sent",
            direction,
            origin,
            html: "<html><body>UNIQUE_HTML_PAYLOAD</body></html>",
          });
          expect(row.filterKeys).toContain(direction);
          expect(row.filterKeys).toContain(origin);
          if (failed) expect(row.filterKeys).toContain("failed");
          else expect(row.filterKeys).not.toContain("failed");
          expect(row.searchText).not.toContain("UNIQUE_HTML_PAYLOAD");
          expect(row.searchText).not.toContain("<html");
        }
      }
    }
  });

  it("treats a missing outbox as sent, not failed", () => {
    const row = toMailboxListingRow({
      publicId: "mbx_2",
      subject: "Test",
      fromEmail: "ops@relay.local",
      fromName: null,
      toEmail: "ops@relay.local",
      tenantName: null,
      status: null,
      direction: "out",
      origin: "test",
    });
    expect(row.filterKeys).toEqual(["out", "test"]);
  });
});

describe("templateTestMailboxLetter", () => {
  it("archives template tests as outbound origin=test after a successful send shape", () => {
    expect(
      templateTestMailboxLetter({
        fromEmail: "ops@relay.local",
        fromName: "Relay",
        toEmail: "ops@relay.local",
        subject: "Preview",
        html: "<p>x</p>",
        text: "x",
      }),
    ).toMatchObject({
      outboxId: null,
      direction: "out",
      origin: "test",
    });
  });
});
