import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { InboundJob } from "../src/env";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const url = "https://tg.example/api/webhooks/relay";
const stubFor = (workspaceId: string) => env.CLIENT.get(env.CLIENT.idFromName(workspaceId));

const rowsOf = (stub: ReturnType<typeof stubFor>, sql: string, ...args: (string | number)[]) =>
  runInDurableObject(stub, (_instance, state) => state.storage.sql.exec(sql, ...args).toArray());

const eml = (lines: string[]) => new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer;

const headers = ({ to = true, messageId = true }: { to?: boolean; messageId?: boolean } = {}) => [
  'From: "Cust" <Cust@Example.com>',
  ...(to ? ["To: info@tiffingrab.ca"] : []),
  "Subject: Invoice",
  ...(messageId ? ["Message-ID: <abc@x>"] : []),
  "Date: Tue, 01 Jul 2025 10:00:00 +0000",
  "MIME-Version: 1.0",
];

const invoiceLetter = (options?: { to?: boolean; messageId?: boolean }) =>
  eml([
    ...headers(options),
    'Content-Type: multipart/mixed; boundary="B"',
    "",
    "--B",
    'Content-Type: multipart/alternative; boundary="A"',
    "",
    "--A",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Hello text",
    "--A",
    "Content-Type: text/html; charset=utf-8",
    "",
    "<p>Hello html</p>",
    "--A--",
    "--B",
    'Content-Type: application/pdf; name="invoice.pdf"',
    'Content-Disposition: attachment; filename="invoice.pdf"',
    "Content-Transfer-Encoding: base64",
    "",
    "JVBERi0=",
    "--B--",
  ]);

const plainLetter = (text: string) =>
  eml([
    "From: cust@example.com",
    "To: info@tiffingrab.ca",
    "Subject: Long",
    "Message-ID: <long@x>",
    "Date: Tue, 01 Jul 2025 10:00:00 +0000",
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
  ]);

// The envelope recipient differs from the header To, so each test shows which one a field came from.
async function putLetter(workspaceId: string, letter: ArrayBuffer): Promise<InboundJob> {
  const rawKey = `ws/${workspaceId}/raw/2026/11/${crypto.randomUUID()}.eml`;
  await env.MAIL.put(rawKey, letter);
  return {
    workspaceId,
    appId: "app_A",
    addressId: "add_1",
    rawKey,
    envelopeFrom: "bounce@example.com",
    envelopeTo: "relay@tiffingrab.ca",
    authResults: "mx; dmarc=pass",
    receivedAt: 1_700_000_000_000,
  };
}

const deliveriesOf = (stub: ReturnType<typeof stubFor>, messageId: string) =>
  rowsOf(stub, "SELECT id, webhook_id, status, payload_key FROM webhook_delivery WHERE message_id = ?", messageId);

describe("ClientDO ingestInbound", () => {
  it("stores the letter, html, attachment and one pending delivery", async () => {
    const ws = "wsp_in_ok";
    const stub = stubFor(ws);
    const sendBatch = vi.spyOn(env.WEBHOOKS, "sendBatch").mockResolvedValue(undefined as never);
    const { webhook } = await stub.createWebhook(ws, "app_A", { url, events: ["mailbox.received"] });
    const job = await putLetter(ws, invoiceLetter());

    const result = await stub.ingestInbound(ws, job);

    expect(result).toEqual({ outcome: "inserted", messageId: expect.stringMatching(/^msg_/), deliveries: 1 });
    const { messageId } = result as { messageId: string };
    const [row] = await rowsOf(
      stub,
      "SELECT direction, status, stream, to_email, from_email, rfc_message_id, address_id, html_key, raw_key, sent_at FROM message WHERE id = ?",
      messageId,
    );
    expect(row).toEqual({
      direction: "in",
      status: "sent",
      stream: "transactional",
      to_email: "relay@tiffingrab.ca",
      from_email: "cust@example.com",
      rfc_message_id: "abc@x",
      address_id: "add_1",
      html_key: `ws/${ws}/msg/${messageId}.html`,
      raw_key: job.rawKey,
      sent_at: Date.parse("Tue, 01 Jul 2025 10:00:00 +0000"),
    });
    expect(await (await env.MAIL.get(`ws/${ws}/msg/${messageId}.html`))?.text()).toContain("<p>Hello html</p>");

    const attachments = await rowsOf(stub, "SELECT r2_key, filename FROM attachment WHERE message_id = ?", messageId);
    expect(attachments).toEqual([{ r2_key: `ws/${ws}/att/${messageId}/0-invoice.pdf`, filename: "invoice.pdf" }]);
    expect(await env.MAIL.get(`ws/${ws}/att/${messageId}/0-invoice.pdf`)).not.toBeNull();

    const deliveries = await deliveriesOf(stub, messageId);
    expect(deliveries).toEqual([
      { id: expect.stringMatching(/^whd_/), webhook_id: webhook.id, status: "pending", payload_key: `ws/${ws}/msg/${messageId}.received.json` },
    ]);
    expect(sendBatch).toHaveBeenCalledWith([{ body: { workspaceId: ws, deliveryId: (deliveries[0] as { id: string }).id } }]);

    const payload = JSON.parse(await (await env.MAIL.get(`ws/${ws}/msg/${messageId}.received.json`))!.text());
    expect(payload).toMatchObject({
      to: "info@tiffingrab.ca",
      from: "cust@example.com",
      fromName: "Cust",
      html: expect.stringContaining("<p>Hello html</p>"),
      messageId,
      envelopeTo: "relay@tiffingrab.ca",
      envelopeFrom: "bounce@example.com",
      authResults: "mx; dmarc=pass",
      receivedAt: 1_700_000_000_000,
    });
  });

  it("returns the same message for a repeated job, with no new rows or deliveries", async () => {
    const ws = "wsp_in_repeat";
    const stub = stubFor(ws);
    const sendBatch = vi.spyOn(env.WEBHOOKS, "sendBatch").mockResolvedValue(undefined as never);
    await stub.createWebhook(ws, "app_A", { url, events: ["mailbox.received"] });
    const job = await putLetter(ws, invoiceLetter());
    const first = (await stub.ingestInbound(ws, job)) as { messageId: string };

    const again = await stub.ingestInbound(ws, job);

    expect(again).toEqual({ outcome: "duplicate", messageId: first.messageId });
    expect(await rowsOf(stub, "SELECT id FROM message")).toHaveLength(1);
    expect(await deliveriesOf(stub, first.messageId)).toHaveLength(1);
    expect(sendBatch).toHaveBeenCalledTimes(1);
  });

  it("stores a letter with 12 attachments and 8 deliveries in one transaction", async () => {
    const ws = "wsp_in_fanout";
    const stub = stubFor(ws);
    const sendBatch = vi.spyOn(env.WEBHOOKS, "sendBatch").mockResolvedValue(undefined as never);
    for (let i = 0; i < 8; i++) await stub.createWebhook(ws, "app_A", { url, events: ["mailbox.received"] });
    const attachments = Array.from({ length: 12 }, (_, i) => [
      "--B",
      `Content-Type: application/pdf; name="doc-${i}.pdf"`,
      `Content-Disposition: attachment; filename="doc-${i}.pdf"`,
      "Content-Transfer-Encoding: base64",
      "",
      "JVBERi0=",
    ]).flat();
    const letter = eml([
      ...headers(),
      'Content-Type: multipart/mixed; boundary="B"',
      "",
      "--B",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Hello text",
      ...attachments,
      "--B--",
    ]);
    const job = await putLetter(ws, letter);

    const result = (await stub.ingestInbound(ws, job)) as { outcome: string; messageId: string; deliveries: number };

    expect(result).toEqual({ outcome: "inserted", messageId: expect.stringMatching(/^msg_/), deliveries: 8 });
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(sendBatch.mock.calls[0][0]).toHaveLength(8);
    expect(await rowsOf(stub, "SELECT id FROM attachment WHERE message_id = ?", result.messageId)).toHaveLength(12);
    expect(await deliveriesOf(stub, result.messageId)).toHaveLength(8);
  });

  it("drops the raw letter of a second copy with the same Message-ID", async () => {
    const ws = "wsp_in_copy";
    const stub = stubFor(ws);
    const first = (await stub.ingestInbound(ws, await putLetter(ws, invoiceLetter()))) as { messageId: string };
    const copy = await putLetter(ws, invoiceLetter());
    await stub.recordInboundFailure(ws, copy, "Letter too large");

    const result = await stub.ingestInbound(ws, copy);

    expect(result).toEqual({ outcome: "duplicate", messageId: first.messageId });
    expect(await env.MAIL.get(copy.rawKey)).toBeNull();
    expect(await rowsOf(stub, "SELECT id FROM inbound_failure WHERE raw_key = ?", copy.rawKey)).toHaveLength(0);
    expect(await env.MAIL.get(`ws/${ws}/msg/${first.messageId}.html`)).not.toBeNull();
    expect(await rowsOf(stub, "SELECT id FROM message")).toHaveLength(1);
  });

  it("keeps the raw letter when a second call for the same raw key passes the raw-key check before the first commits", async () => {
    const ws = "wsp_in_race";
    const stub = stubFor(ws);
    const job = await putLetter(ws, invoiceLetter());
    // Cross-request promise resolution breaks R2 I/O in workerd, so the parked call polls a plain flag on its own timer.
    const realGet = env.MAIL.get;
    let gets = 0;
    let released = false;
    const untilTrue = async (done: () => boolean) => {
      while (!done()) await new Promise((resolve) => setTimeout(resolve, 5));
    };
    vi.spyOn(env.MAIL, "get").mockImplementation((async (key: string) => {
      gets += 1;
      if (gets !== 1) return realGet.call(env.MAIL, key);
      const object = await realGet.call(env.MAIL, key);
      await untilTrue(() => released);
      return object;
    }) as never);

    // The first call is parked after its raw-key check and before its commit, so the second call's check misses too.
    const first = stub.ingestInbound(ws, job);
    const second = stub.ingestInbound(ws, job);
    await untilTrue(() => gets >= 2);
    const secondResult = (await second) as { outcome: string; messageId: string };
    released = true;
    const firstResult = (await first) as { outcome: string; messageId: string };

    expect(secondResult.outcome).toBe("inserted");
    expect(firstResult).toEqual({ outcome: "duplicate", messageId: secondResult.messageId });
    expect(await rowsOf(stub, "SELECT id FROM message")).toHaveLength(1);
    expect(await env.MAIL.get(job.rawKey)).not.toBeNull();
  });

  it("truncates stored text to 262144 characters and keeps the full text in the payload", async () => {
    const ws = "wsp_in_long";
    const stub = stubFor(ws);
    await stub.createWebhook(ws, "app_A", { url, events: ["mailbox.received"] });

    // postal-mime appends a newline to text, so 299_999 characters parse to the 300_000 the payload must carry.
    const result = (await stub.ingestInbound(ws, await putLetter(ws, plainLetter("a".repeat(299_999))))) as { messageId: string };

    const [row] = await rowsOf(stub, "SELECT length(text) AS n FROM message WHERE id = ?", result.messageId);
    expect(row).toEqual({ n: 262_144 });
    const payload = JSON.parse(await (await env.MAIL.get(`ws/${ws}/msg/${result.messageId}.received.json`))!.text());
    expect(payload.text).toHaveLength(300_000);
  });

  it("falls back to the envelope recipient in the payload when the letter has no To", async () => {
    const ws = "wsp_in_noto";
    const stub = stubFor(ws);
    await stub.createWebhook(ws, "app_A", { url, events: ["mailbox.received"] });

    const result = (await stub.ingestInbound(ws, await putLetter(ws, invoiceLetter({ to: false })))) as { messageId: string };

    const payload = JSON.parse(await (await env.MAIL.get(`ws/${ws}/msg/${result.messageId}.received.json`))!.text());
    expect(payload.to).toBe("relay@tiffingrab.ca");
  });

  it("records a failure and keeps the raw letter when the Message-ID is missing", async () => {
    const ws = "wsp_in_nomid";
    const stub = stubFor(ws);
    const job = await putLetter(ws, invoiceLetter({ messageId: false }));

    const result = await stub.ingestInbound(ws, job);

    expect(result).toEqual({ outcome: "failed", error: "Missing Message-ID" });
    expect(await rowsOf(stub, "SELECT error FROM inbound_failure WHERE raw_key = ?", job.rawKey)).toEqual([
      { error: "Missing Message-ID" },
    ]);
    expect(await rowsOf(stub, "SELECT id FROM message")).toHaveLength(0);
    expect(await env.MAIL.get(job.rawKey)).not.toBeNull();
  });

  it("rejects a raw key outside its own workspace", async () => {
    const ws = "wsp_in_scope";
    const stub = stubFor(ws);
    const job = await putLetter(ws, invoiceLetter());

    const error = await runInDurableObject(stub, (instance) =>
      instance.ingestInbound(ws, { ...job, rawKey: "ws/wsp_other/raw/2026/11/x.eml" }).then(
        () => null,
        (err: Error) => err.message,
      ),
    );
    expect(error).toBe("raw key outside workspace");
  });

  it("throws when the raw letter is missing from R2, so the job is retried", async () => {
    const ws = "wsp_in_missing";
    const stub = stubFor(ws);
    const job = { ...(await putLetter(ws, invoiceLetter())), rawKey: `ws/${ws}/raw/2026/11/gone.eml` };

    const error = await runInDurableObject(stub, (instance) =>
      instance.ingestInbound(ws, job).then(
        () => null,
        (err: Error) => err.message,
      ),
    );
    expect(error).toBe("raw mail missing");
    expect(await rowsOf(stub, "SELECT id FROM inbound_failure WHERE raw_key = ?", job.rawKey)).toHaveLength(0);
  });

  it("delivers only to enabled webhooks of the job's app that subscribe to mailbox.received", async () => {
    const ws = "wsp_in_filter";
    const stub = stubFor(ws);
    await stub.createWebhook(ws, "app_A", { url, events: ["mailbox.received"], enabled: false });
    await stub.createWebhook(ws, "app_B", { url, events: ["mailbox.received"] });
    const { webhook } = await stub.createWebhook(ws, "app_A", { url, events: ["mailbox.received"] });
    const sendBatch = vi.spyOn(env.WEBHOOKS, "sendBatch").mockResolvedValue(undefined as never);

    const result = (await stub.ingestInbound(ws, await putLetter(ws, invoiceLetter()))) as { messageId: string; deliveries: number };

    expect(result.deliveries).toBe(1);
    const deliveries = await deliveriesOf(stub, result.messageId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ webhook_id: webhook.id });
    expect(sendBatch).toHaveBeenCalledTimes(1);
  });

  it("writes no payload object when the app has no webhook", async () => {
    const ws = "wsp_in_nohook";
    const stub = stubFor(ws);
    const sendBatch = vi.spyOn(env.WEBHOOKS, "sendBatch").mockResolvedValue(undefined as never);

    const result = (await stub.ingestInbound(ws, await putLetter(ws, invoiceLetter()))) as { messageId: string; deliveries: number };

    expect(result.deliveries).toBe(0);
    expect(await env.MAIL.get(`ws/${ws}/msg/${result.messageId}.received.json`)).toBeNull();
    expect(await env.MAIL.get(`ws/${ws}/msg/${result.messageId}.html`)).not.toBeNull();
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("records a failure count per raw key and clears it once the letter is stored", async () => {
    const ws = "wsp_in_fail";
    const stub = stubFor(ws);
    const job = await putLetter(ws, invoiceLetter());
    await stub.recordInboundFailure(ws, job, "Letter too large");
    await stub.recordInboundFailure(ws, job, "Letter too large");
    expect(await rowsOf(stub, "SELECT attempts, error FROM inbound_failure WHERE raw_key = ?", job.rawKey)).toEqual([
      { attempts: 2, error: "Letter too large" },
    ]);

    const result = (await stub.ingestInbound(ws, job)) as { messageId: string };

    expect(await rowsOf(stub, "SELECT id FROM inbound_failure WHERE raw_key = ?", job.rawKey)).toHaveLength(0);
    await stub.recordInboundFailure(ws, job, "Letter too large");
    expect(await rowsOf(stub, "SELECT id FROM inbound_failure WHERE raw_key = ?", job.rawKey)).toHaveLength(0);
    expect(result.messageId).toMatch(/^msg_/);
  });
});
