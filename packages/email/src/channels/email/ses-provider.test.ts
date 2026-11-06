import { afterEach, describe, expect, it, vi } from "vitest";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { AppError } from "@foundry/commons";
import { SesEmailProvider, getSesSendQuota } from "./ses-provider";

const defaultFrom = { email: "noreply@tiffingrab.ca", name: "Tiffin Grab" };
const credentials = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" };

function fakeFetch(body: unknown = { MessageId: "ses-1" }, status = 200) {
  const sent: { url: string; method: string; json: Record<string, any> }[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const req = input as Request;
    const text = await req.clone().text();
    sent.push({ url: req.url, method: req.method, json: text ? JSON.parse(text) : undefined });
    return Response.json(body, { status });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, sent };
}

const envKeys = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_REGION"] as const;
const saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of envKeys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const make = (fetchFn: typeof fetch, extra: object = {}) =>
  new SesEmailProvider({ defaultFrom, region: "us-east-1", credentials, fetch: fetchFn, ...extra });

describe("SesEmailProvider", () => {
  it("POSTs a SESv2 outbound email and returns the MessageId", async () => {
    const { fetchFn, sent } = fakeFetch();
    const p = make(fetchFn, { configurationSetName: "tg-events" });

    const res = await p.send({
      to: { email: "cust@example.com", name: "Cust" },
      subject: "Order confirmed",
      html: "<p>hi</p>",
    });

    expect(res).toEqual({ providerMessageId: "ses-1", provider: "ses" });
    expect(sent[0].method).toBe("POST");
    expect(sent[0].url).toBe("https://email.us-east-1.amazonaws.com/v2/email/outbound-emails");
    const input = sent[0].json;
    expect(input.FromEmailAddress).toBe("Tiffin Grab <noreply@tiffingrab.ca>");
    expect(input.Destination.ToAddresses).toEqual(["Cust <cust@example.com>"]);
    expect(input.ConfigurationSetName).toBe("tg-events");
    expect(input.Content.Simple.Body.Html.Data).toBe("<p>hi</p>");
    expect(input.Content.Simple.Body.Text).toBeUndefined();
  });

  it("sends tags as SES EmailTags and rejects a tag value SES would refuse", async () => {
    const { fetchFn, sent } = fakeFetch();
    const p = make(fetchFn);
    await p.send({ to: { email: "a@b.com" }, subject: "x", text: "y", tags: { campaign: "42" } });
    expect(sent[0].json.EmailTags).toEqual([{ Name: "campaign", Value: "42" }]);
    await expect(p.send({ to: { email: "a@b.com" }, subject: "x", text: "y", tags: { campaign: "a b" } })).rejects.toThrow();
    await p.send({ to: { email: "a@b.com" }, subject: "x", text: "y" });
    expect(sent[1].json.EmailTags).toBeUndefined();
  });

  it("passes extra headers (List-Unsubscribe) on Simple", async () => {
    const { fetchFn, sent } = fakeFetch();
    await make(fetchFn).send({
      to: { email: "a@b.com" },
      subject: "x",
      text: "y",
      headers: { "List-Unsubscribe": "<https://x.test/api/unsubscribe>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    expect(sent[0].json.Content.Simple.Headers).toEqual([
      { Name: "List-Unsubscribe", Value: "<https://x.test/api/unsubscribe>" },
      { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
    ]);
  });

  it("does not put RFC Message-ID on SES Simple (API MessageId is stored instead)", async () => {
    const { fetchFn, sent } = fakeFetch();
    await make(fetchFn).send({ to: { email: "a@b.com" }, subject: "x", text: "y", rfcMessageId: "<abc@relay.test>" });
    const input = sent[0].json;
    expect(input.Content.Raw).toBeUndefined();
    expect(input.Content.Simple).toBeTruthy();
    expect(JSON.stringify(input)).not.toContain("<abc@relay.test>");
  });

  it("sends Raw MIME (base64 of MailComposer bytes) when the message has attachments", async () => {
    const { fetchFn, sent } = fakeFetch();
    await make(fetchFn).send({
      to: { email: "a@b.com" },
      subject: "Invoice",
      html: "<p>see attached</p>",
      attachments: [
        { filename: "invoice.pdf", content: Buffer.from("pdf-bytes").toString("base64"), contentType: "application/pdf" },
      ],
    });

    const content = sent[0].json.Content;
    expect(content.Simple).toBeUndefined();
    const raw = Buffer.from(content.Raw.Data, "base64").toString("utf8");
    expect(raw).toContain("invoice.pdf");
    expect(raw).toContain("application/pdf");
    expect(raw).toContain(Buffer.from("pdf-bytes").toString("base64"));
    // Same compiler options produce the same MIME modulo the random boundary / Message-ID / Date.
    const norm = (s: string) =>
      s.replace(/^(Message-ID|Date):.*$/gim, "").replace(/----[\w_-]+/g, "BOUNDARY").replace(/_[\w-]{10,}/g, "_X");
    const expected = await new Promise<Buffer>((res, rej) =>
      new MailComposer({
        from: "Tiffin Grab <noreply@tiffingrab.ca>",
        to: ["a@b.com"],
        subject: "Invoice",
        html: "<p>see attached</p>",
        attachments: [{ filename: "invoice.pdf", content: Buffer.from("pdf-bytes"), contentType: "application/pdf" }],
      }).compile().build((e: Error | null, b: Buffer) => (e ? rej(e) : res(b))),
    );
    expect(norm(raw)).toBe(norm(expected.toString("utf8")));
  });

  it("throws when SES returns no MessageId", async () => {
    const { fetchFn } = fakeFetch({});
    await expect(make(fetchFn).send({ to: { email: "a@b.com" }, subject: "x", text: "y" })).rejects.toBeInstanceOf(AppError);
  });

  it("surfaces missing credentials/region at send time as AppError, not at construction", async () => {
    for (const k of envKeys) delete process.env[k];
    const p = new SesEmailProvider({ defaultFrom });
    await expect(p.send({ to: { email: "a@b.com" }, subject: "x", text: "y" })).rejects.toBeInstanceOf(AppError);
  });
});

describe("getSesSendQuota", () => {
  it("GETs the account and maps SendQuota + ProductionAccessEnabled", async () => {
    const { fetchFn, sent } = fakeFetch({
      SendQuota: { Max24HourSend: 50000, SentLast24Hours: 120, MaxSendRate: 14 },
      ProductionAccessEnabled: true,
    });
    const q = await getSesSendQuota({ region: "ca-central-1", credentials, fetch: fetchFn });
    expect(sent[0].method).toBe("GET");
    expect(sent[0].url).toBe("https://email.ca-central-1.amazonaws.com/v2/email/account");
    expect(q).toEqual({ max24HourSend: 50000, sentLast24Hours: 120, maxSendRate: 14, productionAccessEnabled: true });
  });

  it("defaults missing fields to 0/false", async () => {
    const { fetchFn } = fakeFetch({});
    expect(await getSesSendQuota({ region: "us-east-1", credentials, fetch: fetchFn })).toEqual({
      max24HourSend: 0, sentLast24Hours: 0, maxSendRate: 0, productionAccessEnabled: false,
    });
  });
});
