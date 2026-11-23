import { createSign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isValidSnsCertUrl, snsStringToSign, verifySnsMessage, type SnsMessage } from "../src/core/sns";
import { sesEventJobFrom } from "../src/core/ses-events";
import certPem from "./fixtures/sns-test-cert.pem?raw";
import keyPem from "./fixtures/sns-test-key.pem?raw";

const TOPIC = "arn:aws:sns:ap-south-1:947042607945:relay-ses-events";
const CERT_URL = "https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc123.pem";

function signed(fields: Partial<SnsMessage>, version: "1" | "2" = "2"): SnsMessage {
  const base: SnsMessage = {
    Type: "Notification",
    MessageId: "id",
    TopicArn: TOPIC,
    Message: "m",
    Timestamp: "t",
    SignatureVersion: version,
    Signature: "",
    SigningCertURL: CERT_URL,
    ...fields,
  };
  const signer = createSign(version === "2" ? "RSA-SHA256" : "RSA-SHA1");
  signer.update(snsStringToSign(base));
  return { ...base, Signature: signer.sign(keyPem, "base64") };
}

const fetchCert = vi.fn(async (_url: string) => certPem);

describe("verifySnsMessage", () => {
  it("accepts a SignatureVersion 2 (SHA256) notification", async () => {
    expect(await verifySnsMessage(signed({}), fetchCert)).toBe(true);
  });

  it("accepts a SignatureVersion 1 (SHA1) notification", async () => {
    expect(await verifySnsMessage(signed({}, "1"), fetchCert)).toBe(true);
  });

  it("rejects when Message changed after signing", async () => {
    const msg = signed({});
    expect(await verifySnsMessage({ ...msg, Message: "mx" }, fetchCert)).toBe(false);
  });

  it("rejects a SHA1 signature labelled SignatureVersion 2", async () => {
    const msg = signed({}, "1");
    expect(await verifySnsMessage({ ...msg, SignatureVersion: "2" }, fetchCert)).toBe(false);
  });

  it("rejects an unknown SignatureVersion without throwing", async () => {
    expect(await verifySnsMessage({ ...signed({}), SignatureVersion: "3" }, fetchCert)).toBe(false);
  });

  it("never fetches a cert for a URL outside the SNS host", async () => {
    const spy = vi.fn(async (_url: string) => certPem);
    const msg = signed({ SigningCertURL: "https://sns.ap-south-1.amazonaws.com.evil.com/SimpleNotificationService-abc123.pem" });
    expect(await verifySnsMessage(msg, spy)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns false when the cert fetch fails", async () => {
    const msg = signed({ SigningCertURL: "https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-fail.pem" });
    expect(await verifySnsMessage(msg, async () => Promise.reject(new Error("down")))).toBe(false);
  });
});

describe("isValidSnsCertUrl", () => {
  it("accepts the regional SNS host and cert path", () => {
    expect(isValidSnsCertUrl(CERT_URL, "ap-south-1")).toBe(true);
  });

  it("rejects a host that only starts with the SNS host", () => {
    expect(isValidSnsCertUrl("https://sns.ap-south-1.amazonaws.com.evil.com/SimpleNotificationService-abc123.pem", "ap-south-1")).toBe(false);
  });

  it("rejects http", () => {
    expect(isValidSnsCertUrl(CERT_URL.replace("https:", "http:"), "ap-south-1")).toBe(false);
  });

  it("rejects another region", () => {
    expect(isValidSnsCertUrl(CERT_URL, "us-east-1")).toBe(false);
  });

  it("rejects a path that is not an SNS cert", () => {
    expect(isValidSnsCertUrl("https://sns.ap-south-1.amazonaws.com/x.pem", "ap-south-1")).toBe(false);
  });
});

describe("snsStringToSign", () => {
  it("omits Subject when the notification has none", () => {
    const msg = {
      Type: "Notification",
      MessageId: "id",
      TopicArn: "arn",
      Message: "m",
      Timestamp: "t",
    } as SnsMessage;
    expect(snsStringToSign(msg)).toBe("Message\nm\nMessageId\nid\nTimestamp\nt\nTopicArn\narn\nType\nNotification\n");
  });

  it("includes Subject between MessageId and Timestamp when present", () => {
    const msg = signed({ Subject: "s" });
    expect(snsStringToSign(msg)).toBe(
      "Message\nm\nMessageId\nid\nSubject\ns\nTimestamp\nt\nTopicArn\n" + TOPIC + "\nType\nNotification\n",
    );
  });
});

describe("sesEventJobFrom", () => {
  const bounce = JSON.stringify({
    eventType: "Bounce",
    mail: { messageId: "ses-1", tags: { ws: ["wsp_a"], msg: ["msg_b"] } },
    bounce: {
      bounceType: "Permanent",
      timestamp: "2026-11-24T10:00:00.000Z",
      bouncedRecipients: [{ emailAddress: "A@X.com" }],
    },
  });

  it("maps a bounce to a job with lowercased recipients", () => {
    expect(sesEventJobFrom("sns-1", bounce)).toEqual({
      workspaceId: "wsp_a",
      messageId: "msg_b",
      sesMessageId: "ses-1",
      snsMessageId: "sns-1",
      type: "Bounce",
      occurredAt: Date.parse("2026-11-24T10:00:00.000Z"),
      recipients: ["a@x.com"],
      bounceType: "Permanent",
    });
  });

  it("carries the click link", () => {
    const click = JSON.stringify({
      eventType: "Click",
      mail: { messageId: "ses-1", tags: { ws: ["wsp_a"], msg: ["msg_b"] }, destination: ["a@x.com"], timestamp: "2026-11-24T09:00:00.000Z" },
      click: { link: "https://relay.a6n.ai/x", timestamp: "2026-11-24T10:00:00.000Z" },
    });
    expect(sesEventJobFrom("sns-1", click)).toMatchObject({
      type: "Click",
      link: "https://relay.a6n.ai/x",
      recipients: ["a@x.com"],
      occurredAt: Date.parse("2026-11-24T10:00:00.000Z"),
    });
  });

  it("returns null without ws/msg tags", () => {
    const untagged = JSON.stringify({ eventType: "Bounce", mail: { messageId: "ses-1" }, bounce: {} });
    expect(sesEventJobFrom("sns-1", untagged)).toBeNull();
  });

  it("returns null for a non-event type", () => {
    const sub = JSON.stringify({ eventType: "Subscription", mail: { messageId: "ses-1", tags: { ws: ["w"], msg: ["m"] } } });
    expect(sesEventJobFrom("sns-1", sub)).toBeNull();
  });

  it("returns null for bad JSON", () => {
    expect(sesEventJobFrom("sns-1", "{nope")).toBeNull();
  });
});
