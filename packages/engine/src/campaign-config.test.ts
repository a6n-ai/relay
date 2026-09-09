import { describe, expect, it } from "vitest";
import { buildCampaignConfig } from "./campaign-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tables = {} as any;

describe("buildCampaignConfig", () => {
  it("returns undefined when any footer input is missing", () => {
    expect(buildCampaignConfig(tables, {}, { senderName: "X" })).toBeUndefined();
    expect(
      buildCampaignConfig(
        tables,
        { UNSUBSCRIBE_SECRET: "s", CAMPAIGN_POSTAL_ADDRESS: "123 St" },
        { senderName: "X" },
      ),
    ).toBeUndefined();
  });

  it("falls back to SITE_URL for the base url and the given default sender name", () => {
    const config = buildCampaignConfig(
      tables,
      { UNSUBSCRIBE_SECRET: "s", CAMPAIGN_POSTAL_ADDRESS: "123 St", SITE_URL: "https://x.test" },
      { senderName: "X" },
    );
    expect(config).toEqual({
      tables,
      unsubscribe: { baseUrl: "https://x.test", secret: "s" },
      sender: { name: "X", postalAddress: "123 St" },
    });
  });

  it("prefers CAMPAIGN_BASE_URL and CAMPAIGN_SENDER_NAME when set", () => {
    const config = buildCampaignConfig(
      tables,
      {
        UNSUBSCRIBE_SECRET: "s",
        CAMPAIGN_POSTAL_ADDRESS: "123 St",
        SITE_URL: "https://x.test",
        CAMPAIGN_BASE_URL: "https://mail.x.test",
        CAMPAIGN_SENDER_NAME: "Y",
      },
      { senderName: "X" },
    );
    expect(config?.unsubscribe.baseUrl).toBe("https://mail.x.test");
    expect(config?.sender.name).toBe("Y");
  });
});
