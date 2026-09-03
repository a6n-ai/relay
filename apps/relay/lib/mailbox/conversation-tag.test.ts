import { describe, expect, it } from "vitest";
import { conversationTagSlug, tagFilterKey } from "./conversation-tag";

describe("conversationTagSlug", () => {
  it("turns an operator label into a filter id", () => {
    expect(conversationTagSlug("  VIP customer ")).toBe("vip-customer");
    expect(tagFilterKey("vip-customer")).toBe("tag:vip-customer");
  });

  it("rejects empty or punctuation-only labels", () => {
    expect(conversationTagSlug("!!!")).toBeNull();
    expect(conversationTagSlug("")).toBeNull();
  });
});
