import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const validated: Record<string, unknown>[] = [];
let validatorError: Error | null = null;
vi.mock("sns-validator", () => ({
  default: class {
    validate(msg: Record<string, unknown>, cb: (err: Error | null) => void) {
      validated.push(msg);
      cb(validatorError);
    }
  },
}));
vi.mock("@/db/client", () => ({ db: { select: () => ({ from: async () => [] }) } }));
vi.mock("@/db/schema", () => ({ tenants: {} }));
vi.mock("@/lib/notifications/suppression", () => ({ suppressEmailRecipient: vi.fn() }));
vi.mock("@/lib/webhooks/enqueue", () => ({ enqueueTenantWebhooks: vi.fn() }));

const { POST } = await import("./route");

const TOPIC = "arn:aws:sns:ap-south-1:947042607945:relay-ses-events";
const confirmation = {
  Type: "SubscriptionConfirmation",
  TopicArn: TOPIC,
  Message: "You have chosen to subscribe",
  SubscribeURL: "https://sns.ap-south-1.amazonaws.com/?Action=ConfirmSubscription&Token=t",
  Token: "t",
  Signature: "sig",
  SigningCertURL: "https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem",
  SignatureVersion: "1",
  MessageId: "m",
  Timestamp: "2026-11-10T00:00:00Z",
};
const post = (body: unknown) => POST(new Request("https://relay.test/api/webhooks/ses", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/webhooks/ses", () => {
  const fetchMock = vi.fn(async () => new Response("ok"));
  beforeEach(() => {
    validated.length = 0;
    validatorError = null;
    process.env.SES_FEEDBACK_TOPIC_ARN = TOPIC;
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockClear();
    delete process.env.SES_FEEDBACK_TOPIC_ARN;
  });

  it("verifies the whole signed message, not a trimmed envelope", async () => {
    await post(confirmation);
    expect(validated[0]).toMatchObject({ Signature: "sig", SigningCertURL: confirmation.SigningCertURL, Token: "t" });
  });

  it("confirms a subscription from the configured topic", async () => {
    expect((await post(confirmation)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(confirmation.SubscribeURL);
  });

  it("refuses another AWS account's topic, even when SNS signed it", async () => {
    const res = await post({ ...confirmation, TopicArn: "arn:aws:sns:us-east-1:111111111111:evil" });
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when no topic is configured", async () => {
    delete process.env.SES_FEEDBACK_TOPIC_ARN;
    expect((await post(confirmation)).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a bad signature", async () => {
    validatorError = new Error("bad");
    expect((await post(confirmation)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
