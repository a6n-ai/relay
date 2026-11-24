import { describe, expect, it } from "vitest";
import { type CampaignDraft, isDirty } from "../src/components/campaign-dirty";

const saved: CampaignDraft = { from: "a@x.test", subject: "Hi", html: "<p>1</p>", text: "1" };

describe("isDirty", () => {
  it("is clean when the form matches the saved row", () => {
    expect(isDirty(saved, { ...saved })).toBe(false);
  });

  it.each([
    ["from", { from: "b@x.test" }],
    ["subject", { subject: "Hello" }],
    ["html", { html: "<p>2</p>" }],
    ["text", { text: "2" }],
  ])("is dirty when %s changes", (_field, change) => {
    expect(isDirty(saved, { ...saved, ...change })).toBe(true);
  });
});
