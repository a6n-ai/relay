import { describe, expect, it } from "vitest";
import { routingDiff, type EmailEventRouting } from "./email-events-diff";

const before: EmailEventRouting = { webhook: ["bounce", "complaint"], counts: ["send"] };

describe("routingDiff", () => {
  it("lists additions and removals per column with the stream label", () => {
    const after: EmailEventRouting = { webhook: ["bounce", "complaint", "delivery"], counts: [] };
    expect(routingDiff(before, after, "Marketing")).toEqual([
      "Marketing: Webhook +Delivery",
      "Marketing: Counts -Send",
    ]);
  });
  it("is empty when nothing changed", () => {
    expect(routingDiff(before, { webhook: [...before.webhook], counts: ["send"] }, "X")).toEqual([]);
  });
  it("never reports bounce or complaint as removable", () => {
    expect(routingDiff(before, { webhook: [], counts: ["send"] }, "X")).toEqual([]);
  });
  it("ignores counts when the stream has no counts destination", () => {
    expect(routingDiff({ webhook: [], counts: null }, { webhook: ["send"], counts: null })).toEqual(["Webhook +Send"]);
  });
});
