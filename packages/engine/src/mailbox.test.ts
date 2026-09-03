import { describe, expect, it } from "vitest";
import {
  letterFilterKeys,
  mailboxInsertValues,
  mailboxOriginFromCampaignId,
  mailboxRetryBodySet,
} from "./mailbox";

describe("mailboxOriginFromCampaignId", () => {
  it("maps a campaign queue row to campaign", () => {
    expect(mailboxOriginFromCampaignId(9n)).toBe("campaign");
  });

  it("maps API or automation rows with no campaign to automatic", () => {
    expect(mailboxOriginFromCampaignId(null)).toBe("automatic");
    expect(mailboxOriginFromCampaignId(undefined)).toBe("automatic");
  });
});

describe("letterFilterKeys", () => {
  it.each([
    {
      name: "automatic + sent",
      input: { direction: "out" as const, origin: "automatic" as const, outboxStatus: "sent" as const },
      keys: ["out", "automatic"],
    },
    {
      name: "campaign + failed",
      input: { direction: "out" as const, origin: "campaign" as const, outboxStatus: "failed" as const },
      keys: ["out", "campaign", "failed"],
    },
    {
      name: "test send with no outbox",
      input: { direction: "out" as const, origin: "test" as const, outboxStatus: null },
      keys: ["out", "test"],
    },
    {
      name: "inbound is only Received",
      input: { direction: "in" as const, origin: "automatic" as const, outboxStatus: "failed" as const },
      keys: ["in"],
    },
    {
      name: "manual send",
      input: { direction: "out" as const, origin: "manual" as const, outboxStatus: "sent" as const },
      keys: ["out", "manual"],
    },
  ])("$name", ({ input, keys }) => {
    expect(letterFilterKeys(input)).toEqual(keys);
  });
});

describe("mailboxInsertValues", () => {
  const base = {
    outboxId: 1n,
    tenantId: 2n,
    fromEmail: "ops@relay.local",
    fromName: "Relay",
    toEmail: "a@b.com",
    subject: "Hi",
    html: "<p>secret-html</p>",
    text: "secret-html",
  };

  it("sets origin=campaign on the insert payload for campaign rows", () => {
    expect(
      mailboxInsertValues({
        ...base,
        origin: mailboxOriginFromCampaignId(3n),
      }),
    ).toMatchObject({ origin: "campaign", direction: "out" });
  });

  it("sets origin=automatic on the insert payload for API-shaped rows", () => {
    expect(
      mailboxInsertValues({
        ...base,
        origin: mailboxOriginFromCampaignId(null),
      }),
    ).toMatchObject({ origin: "automatic", direction: "out" });
  });

  it("leaves threading ids off the retry conflict set so they are not blanked", () => {
    const letter = { ...base, origin: "automatic" as const, rfcMessageId: "<keep@relay.test>", threadId: "<keep@relay.test>" };
    const set = mailboxRetryBodySet(letter, mailboxInsertValues(letter));
    expect(set).not.toHaveProperty("rfcMessageId");
    expect(set).not.toHaveProperty("threadId");
    expect(set).not.toHaveProperty("inReplyTo");
    expect(set).not.toHaveProperty("rfcReferences");
  });
});
