import { describe, expect, it } from "vitest";
import { webhookUrlForInput, webhookUrlFromInput } from "../src/components/webhooks/webhook-url";

describe("webhook url input", () => {
  it("adds https:// to a host", () => {
    expect(webhookUrlFromInput("example.com/hook")).toBe("https://example.com/hook");
  });
  it("accepts a pasted full url without doubling the scheme", () => {
    expect(webhookUrlFromInput("https://example.com/hook")).toBe("https://example.com/hook");
    expect(webhookUrlFromInput("HTTPS://example.com")).toBe("https://example.com");
  });
  it("keeps http:// so the server rejects it", () => {
    expect(webhookUrlFromInput("http://example.com")).toBe("https://http://example.com");
  });
  it("stays empty when cleared and shows only the host", () => {
    expect(webhookUrlFromInput("")).toBe("");
    expect(webhookUrlFromInput("https://")).toBe("");
    expect(webhookUrlForInput("https://example.com/hook")).toBe("example.com/hook");
  });
});
