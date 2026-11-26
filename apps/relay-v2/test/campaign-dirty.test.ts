import { describe, expect, it } from "vitest";
import { baselineFrom, type CampaignDraft, isDirty } from "../src/components/campaign-dirty";

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

  it("ignores list order", () => {
    expect(isDirty({ ...saved, listIds: ["a", "b"] }, { ...saved, listIds: ["b", "a"] })).toBe(false);
  });

  it.each([
    ["added", ["a", "b", "c"]],
    ["removed", ["a"]],
  ])("is dirty when a list is %s", (_k, listIds) => {
    expect(isDirty({ ...saved, listIds: ["a", "b"] }, { ...saved, listIds })).toBe(true);
  });
});

describe("baselineFrom", () => {
  it("uses the saved From", () => expect(baselineFrom("a@x.test", ["b@x.test"])).toBe("a@x.test"));
  it("falls back to a lone sender", () => expect(baselineFrom(null, ["b@x.test"])).toBe("b@x.test"));
  it("is empty with several senders", () => expect(baselineFrom(null, ["a", "b"])).toBe(""));
});
