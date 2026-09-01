import { describe, expect, it } from "vitest";
import { parseSnsEnvelope, sesSuppressionsFromEvent } from "./ses-events";

describe("sesSuppressionsFromEvent", () => {
  it("suppresses permanent bounces", () => {
    expect(
      sesSuppressionsFromEvent({
        eventType: "Bounce",
        bounce: {
          bounceType: "Permanent",
          bouncedRecipients: [{ emailAddress: "a@x.com" }, { emailAddress: "b@x.com" }],
        },
      }),
    ).toEqual([
      { email: "a@x.com", reason: "SES hard bounce" },
      { email: "b@x.com", reason: "SES hard bounce" },
    ]);
  });

  it("ignores transient bounces", () => {
    expect(
      sesSuppressionsFromEvent({
        notificationType: "Bounce",
        bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "a@x.com" }] },
      }),
    ).toEqual([]);
  });

  it("suppresses complaints", () => {
    expect(
      sesSuppressionsFromEvent({
        eventType: "Complaint",
        complaint: { complainedRecipients: [{ emailAddress: "c@x.com" }] },
      }),
    ).toEqual([{ email: "c@x.com", reason: "SES complaint" }]);
  });
});

describe("parseSnsEnvelope", () => {
  it("returns null for invalid JSON or a payload missing Type/Message", () => {
    expect(parseSnsEnvelope("not-json")).toBeNull();
    expect(parseSnsEnvelope("{}")).toBeNull();
  });

  it("reads a Notification envelope", () => {
    expect(
      parseSnsEnvelope(JSON.stringify({ Type: "Notification", TopicArn: "arn:aws:sns:x", Message: "{}" })),
    ).toEqual({ Type: "Notification", TopicArn: "arn:aws:sns:x", Message: "{}" });
  });
});
