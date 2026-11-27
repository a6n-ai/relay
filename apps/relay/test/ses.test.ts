import { AwsError } from "@foundry/cloud";
import { describe, expect, it, vi } from "vitest";
import {
  configSetFor,
  SES_CONFIG_SETS,
  isRetryableSesError,
  retryDelaySeconds,
  sendEmailBody,
  sesTransport,
  type SesSendRequest,
} from "../src/core/ses";
import type { Env } from "../src/env";
import { SES_REGION_IDS } from "../src/shared/regions";

const credsEnv = { AWS_ACCESS_KEY_ID: "AKIDTEST", AWS_SECRET_ACCESS_KEY: "secret" } as Partial<Env> as Env;

const request: SesSendRequest = {
  region: "us-east-1",
  stream: "transactional",
  from: "orders@tiffingrab.ca",
  fromName: "TiffinGrab",
  to: "a@x.com",
  subject: "Order 1",
  html: "<p>Hi</p>",
  text: "Hi",
  tags: { ws: "wsp_a", msg: "msg_b" },
};

const sesOk = (body: unknown) =>
  vi.fn(async (_req: Request) => new Response(JSON.stringify(body), { status: 200 }));

describe("configSetFor", () => {
  it("maps region and stream to the fixed config set", () => {
    expect(configSetFor("us-east-1", "tracked")).toBe("tiffin-grab-transactional-tracked");
    expect(configSetFor("ap-south-1", "marketing")).toBe("relay-marketing");
  });

  it("has config sets for exactly the shared region list", () => {
    expect(Object.keys(SES_CONFIG_SETS).sort()).toEqual([...SES_REGION_IDS].sort());
  });

  it("throws for a region outside the table", () => {
    expect(() => configSetFor("eu-west-1", "transactional")).toThrow("no SES config set for region eu-west-1");
  });
});

describe("sendEmailBody", () => {
  it("builds the SESv2 body with tags and HTML", () => {
    const body = sendEmailBody(request);
    expect(body.FromEmailAddress).toBe('"TiffinGrab" <orders@tiffingrab.ca>');
    expect(body.ConfigurationSetName).toBe("tiffin-grab-transactional");
    expect(body.EmailTags).toEqual([
      { Name: "ws", Value: "wsp_a" },
      { Name: "msg", Value: "msg_b" },
    ]);
    expect(body.Content.Simple.Body.Html?.Data).toBe("<p>Hi</p>");
  });

  it("omits Html when html is null", () => {
    expect(sendEmailBody({ ...request, html: null }).Content.Simple.Body.Html).toBeUndefined();
  });

  it.each([
    ["a comma", "Tiffin, Grab", '"Tiffin, Grab" <orders@tiffingrab.ca>'],
    ["a double quote", 'Say "hi"', '"Say \\"hi\\"" <orders@tiffingrab.ca>'],
    ["a backslash", "a\\b", '"a\\\\b" <orders@tiffingrab.ca>'],
    ["a non-ASCII name", "Café", "=?UTF-8?B?Q2Fmw6k=?= <orders@tiffingrab.ca>"],
    ["a null name", null, "orders@tiffingrab.ca"],
  ])("formats the From display name for %s", (_label, fromName, expected) => {
    expect(sendEmailBody({ ...request, fromName }).FromEmailAddress).toBe(expected);
  });

  it("sends reply-to and attachments as SES fields, with the bytes base64 encoded", () => {
    const body = sendEmailBody({
      ...request,
      replyTo: "help@tiffingrab.ca",
      attachments: [{ filename: "receipt.pdf", contentType: "application/pdf", bytes: new Uint8Array([0, 1, 2, 250, 255]) }],
    });
    expect(body.ReplyToAddresses).toEqual(["help@tiffingrab.ca"]);
    expect(body.Content.Simple.Attachments).toEqual([
      { FileName: "receipt.pdf", ContentType: "application/pdf", RawContent: "AAEC+v8=" },
    ]);
    expect(sendEmailBody(request)).not.toHaveProperty("ReplyToAddresses");
  });

  it("rejects a line break in a header field", () => {
    expect(() => sendEmailBody({ ...request, subject: "Hi\r\nBcc: x@evil.com" })).toThrow(
      "header contains a line break",
    );
  });

  it("sends custom headers as Content.Simple.Headers and refuses a line break in one", () => {
    const headers = [
      { name: "List-Unsubscribe", value: "<https://relay.test/u/x>" },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ];
    expect(sendEmailBody({ ...request, headers }).Content.Simple.Headers).toEqual([
      { Name: "List-Unsubscribe", Value: "<https://relay.test/u/x>" },
      { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
    ]);
    expect(() => sendEmailBody({ ...request, headers: [{ name: "X", value: "a\nBcc: x@evil.com" }] })).toThrow(
      "header contains a line break",
    );
  });
});

describe("sesTransport", () => {
  it("signs the request for the regional SES endpoint and returns the MessageId", async () => {
    const fetchSpy = sesOk({ MessageId: "ses-1" });
    const transport = sesTransport(credsEnv, fetchSpy as unknown as typeof fetch);

    await expect(transport.send(request)).resolves.toEqual({ sesMessageId: "ses-1" });

    const signed = fetchSpy.mock.calls[0][0];
    expect(signed.url).toBe("https://email.us-east-1.amazonaws.com/v2/email/outbound-emails");
    expect(signed.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDTEST\/\d{8}\/us-east-1\/ses\/aws4_request/,
    );
  });

  it.each(["from", "fromName", "to", "subject"] as const)(
    "rejects a line break in %s before any request is made",
    async (field) => {
      const fetchSpy = sesOk({ MessageId: "ses-1" });
      const transport = sesTransport(credsEnv, fetchSpy as unknown as typeof fetch);
      await expect(transport.send({ ...request, [field]: "x\r\nBcc: a@b.c" })).rejects.toThrow(
        "header contains a line break",
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("rejects when SES returns no MessageId", async () => {
    const transport = sesTransport(credsEnv, sesOk({}) as unknown as typeof fetch);
    await expect(transport.send(request)).rejects.toThrow("SES returned no MessageId");
  });
});

describe("isRetryableSesError", () => {
  it("retries throttling, 5xx, timeouts and network failures", () => {
    expect(isRetryableSesError(new AwsError("Throttling", "x", { status: 429 }))).toBe(true);
    expect(isRetryableSesError(new AwsError("InternalFailure", "x", { status: 503 }))).toBe(true);
    expect(isRetryableSesError(new AwsError("Timeout", "x"))).toBe(true);
    expect(isRetryableSesError(new TypeError("network"))).toBe(true);
  });

  it("treats a 400 rejection as permanent", () => {
    expect(isRetryableSesError(new AwsError("MessageRejected", "x", { status: 400 }))).toBe(false);
  });
});

describe("retryDelaySeconds", () => {
  it("doubles from 30 s and caps at 900 s", () => {
    expect([1, 2, 3, 4, 10].map(retryDelaySeconds)).toEqual([30, 60, 120, 240, 900]);
  });
});
