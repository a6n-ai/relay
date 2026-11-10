import { describe, expect, it } from "vitest";
import { emailChannelReady, operatorEmailPrereqs, prereqSummary } from "./prerequisites";
import { domainOf } from "./sender-domain";

describe("operatorEmailPrereqs", () => {
  it("marks transport and from when they are present", () => {
    const prereqs = operatorEmailPrereqs({
      transport: "smtp",
      fromEmail: "noreply@relay.local",
      fromName: "Relay",
      smtpHost: "smtp.example.com",
      bounceWebhookPath: "/api/webhooks/ses",
      verifiedDomainCount: 1,
    });
    expect(prereqs.find((p) => p.id === "transport")?.status).toBe("ready");
    expect(prereqs.find((p) => p.id === "from")?.status).toBe("ready");
    expect(prereqs.find((p) => p.id === "identity")?.status).toBe("ready");
    expect(emailChannelReady(prereqs)).toBe(true);
  });

  it("fails emailChannelReady without a From address", () => {
    const prereqs = operatorEmailPrereqs({
      transport: "ses",
      fromEmail: null,
      fromName: null,
      smtpHost: null,
      bounceWebhookPath: "/api/webhooks/ses",
      verifiedDomainCount: 0,
    });
    expect(emailChannelReady(prereqs)).toBe(false);
  });
});

describe("prereqSummary", () => {
  it("counts the same statuses the chips show and keeps dependants missing without a domain", () => {
    const prereqs = operatorEmailPrereqs({
      transport: "ses",
      fromEmail: "a@b.co",
      fromName: null,
      smtpHost: null,
      bounceWebhookPath: "/api/webhooks/ses",
      verifiedDomainCount: 0,
    });
    expect(prereqs.find((p) => p.id === "alignment")?.status).toBe("missing");
    expect(prereqSummary(prereqs)).toBe("3 of 5 ready");
  });
});

describe("domainOf", () => {
  it("reads the domain from a sender mailbox", () => {
    expect(domainOf("info@tiffingrab.ca")).toBe("tiffingrab.ca");
  });
});
