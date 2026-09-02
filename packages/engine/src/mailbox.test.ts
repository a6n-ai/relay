import { describe, expect, it } from "vitest";
import {
  letterFilterKeys,
  mailboxInsertValues,
  mailboxOriginFromCampaignId,
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
      name: "inbound shape (unused chip until plan 3)",
      input: { direction: "in" as const, origin: "automatic" as const, outboxStatus: "sent" as const },
      keys: ["in", "automatic"],
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
});
