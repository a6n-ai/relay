import { env, SELF } from "cloudflare:test";
import { createSign } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import { primeCertCache, snsStringToSign, type SnsMessage } from "../src/core/sns";
import certPem from "./fixtures/sns-test-cert.pem?raw";
import keyPem from "./fixtures/sns-test-key.pem?raw";

const TOPIC = "arn:aws:sns:ap-south-1:947042607945:relay-ses-events";
const CERT_URL = "https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc123.pem";

function signed(fields: Partial<SnsMessage>): SnsMessage {
  const base: SnsMessage = {
    Type: "Notification",
    MessageId: "sns-1",
    TopicArn: TOPIC,
    Message: "",
    Timestamp: "2026-11-24T10:00:00.000Z",
    SignatureVersion: "2",
    Signature: "",
    SigningCertURL: CERT_URL,
    ...fields,
  };
  const signer = createSign("RSA-SHA256");
  signer.update(snsStringToSign(base));
  return { ...base, Signature: signer.sign(keyPem, "base64") };
}

const tagged = JSON.stringify({
  eventType: "Bounce",
  mail: { messageId: "ses-1", tags: { ws: ["wsp_a"], msg: ["msg_b"] } },
  bounce: { bounceType: "Permanent", timestamp: "2026-11-24T10:00:00.000Z", bouncedRecipients: [{ emailAddress: "a@x.com" }] },
});

const post = (body: unknown) =>
  SELF.fetch("https://relay.test/api/webhooks/ses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

let enqueue: MockInstance<typeof env.SES_EVENTS.send>;

beforeAll(() => {
  primeCertCache(CERT_URL, certPem);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/ses", () => {
  it("rejects a topic outside the allowlist with 403 and fetches nothing", async () => {
    enqueue = vi.spyOn(env.SES_EVENTS, "send").mockResolvedValue(undefined as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await post(signed({ TopicArn: "arn:aws:sns:ap-south-1:947042607945:other", Message: tagged }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "unexpected topic" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("rejects a bad signature with 403 and enqueues nothing", async () => {
    enqueue = vi.spyOn(env.SES_EVENTS, "send").mockResolvedValue(undefined as never);
    const msg = signed({ Message: tagged });
    const res = await post({ ...msg, Message: tagged.replace("Permanent", "Transient") });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "invalid signature" });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enqueues one job for a valid tagged notification", async () => {
    enqueue = vi.spyOn(env.SES_EVENTS, "send").mockResolvedValue(undefined as never);
    const res = await post(signed({ Message: tagged }));
    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "wsp_a", messageId: "msg_b", snsMessageId: "sns-1", type: "Bounce" }),
    );
  });

  it("acknowledges a valid notification without tags and enqueues nothing", async () => {
    enqueue = vi.spyOn(env.SES_EVENTS, "send").mockResolvedValue(undefined as never);
    const untagged = JSON.stringify({ eventType: "Bounce", mail: { messageId: "ses-1" }, bounce: {} });
    const res = await post(signed({ Message: untagged }));
    expect(res.status).toBe(200);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("answers 503 when no topic is allowlisted", async () => {
    enqueue = vi.spyOn(env.SES_EVENTS, "send").mockResolvedValue(undefined as never);
    const saved = env.SES_EVENT_TOPIC_ARNS;
    env.SES_EVENT_TOPIC_ARNS = "";
    try {
      const res = await post(signed({ Message: tagged }));
      expect(res.status).toBe(503);
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      env.SES_EVENT_TOPIC_ARNS = saved;
    }
  });

  it("answers 400 to a body that is not an SNS envelope", async () => {
    expect((await post("{nope")).status).toBe(400);
    expect((await post({ Type: "Notification" })).status).toBe(400);
  });

  it("confirms a subscription only through the regional SNS host", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    const evil = "https://sns.ap-south-1.amazonaws.com.evil.com/?Action=ConfirmSubscription";
    const good = "https://sns.ap-south-1.amazonaws.com/?Action=ConfirmSubscription&Token=t";
    expect((await post(signed({ Type: "SubscriptionConfirmation", Message: "hi", Token: "t", SubscribeURL: evil }))).status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await post(signed({ Type: "SubscriptionConfirmation", Message: "hi", Token: "t", SubscribeURL: good }))).status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(good, expect.anything());
  });
});
