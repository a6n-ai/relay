import { AwsError, createAwsClient } from "@foundry/cloud";
import type { Env } from "../env";
import { type Stream } from "../shared/mail";
import { isSesRegion, type SesRegion } from "../shared/regions";

// Keyed by SesRegion, so a region added to shared/regions.ts fails the build here until it has config sets.
export const SES_CONFIG_SETS: Record<SesRegion, Record<Stream, string>> = {
  "ap-south-1": {
    transactional: "relay-prod",
    tracked: "relay-prod-tracked",
    marketing: "relay-marketing",
  },
  "us-east-1": {
    transactional: "tiffin-grab-transactional",
    tracked: "tiffin-grab-transactional-tracked",
    marketing: "tiffin-grab-prod",
  },
};

export function configSetFor(region: string, stream: Stream): string {
  if (!isSesRegion(region)) throw new Error(`no SES config set for region ${region}`);
  return SES_CONFIG_SETS[region][stream];
}

export type SesSendRequest = {
  region: string;
  stream: Stream;
  from: string;
  fromName: string | null;
  to: string;
  subject: string;
  html: string | null;
  text: string;
  tags?: { ws: string; msg: string };
  headers?: { name: string; value: string }[];
  replyTo?: string | null;
  attachments?: SesAttachment[];
};

export type SesAttachment = { filename: string; contentType: string; bytes: Uint8Array };

export type SesTransport = { send(req: SesSendRequest): Promise<{ sesMessageId: string }> };

export const MAX_SEND_ATTEMPTS = 5;

export function retryDelaySeconds(attempt: number): number {
  return Math.min(30 * 2 ** (attempt - 1), 900);
}

// shortcut: one encoded-word per name; RFC 2047 caps a word at 75 chars (about 45 UTF-8 bytes of name), split if long names appear.
function formatFrom(name: string | null, address: string): string {
  if (!name) return address;
  if (/^[\x20-\x7e]*$/.test(name)) return `"${name.replace(/[\\"]/g, "\\$&")}" <${address}>`;
  const bytes = new TextEncoder().encode(name);
  return `=?UTF-8?B?${btoa(String.fromCharCode(...bytes))}?= <${address}>`;
}

// Chunked: spreading a multi-megabyte array into one fromCharCode call overflows the stack.
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function sendEmailBody(req: SesSendRequest) {
  const headerText = (req.headers ?? []).flatMap((h) => [h.name, h.value]);
  if ([req.from, req.fromName, req.to, req.subject, req.replyTo, ...headerText].some((v) => v && /[\r\n]/.test(v))) {
    throw new Error("header contains a line break");
  }
  return {
    FromEmailAddress: formatFrom(req.fromName, req.from),
    Destination: { ToAddresses: [req.to] },
    ...(req.replyTo ? { ReplyToAddresses: [req.replyTo] } : {}),
    ConfigurationSetName: configSetFor(req.region, req.stream),
    ...(req.tags
      ? {
          EmailTags: [
            { Name: "ws", Value: req.tags.ws },
            { Name: "msg", Value: req.tags.msg },
          ],
        }
      : {}),
    Content: {
      Simple: {
        Subject: { Data: req.subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: req.text, Charset: "UTF-8" },
          ...(req.html !== null ? { Html: { Data: req.html, Charset: "UTF-8" } } : {}),
        },
        ...(req.headers ? { Headers: req.headers.map((h) => ({ Name: h.name, Value: h.value })) } : {}),
        ...(req.attachments?.length
          ? { Attachments: req.attachments.map((a) => ({ FileName: a.filename, ContentType: a.contentType, RawContent: base64(a.bytes) })) }
          : {}),
      },
    },
  };
}

type AwsSes = ReturnType<typeof createAwsClient>;

// Keyed by fetch as well as region so an injected fetch is never served a client bound to another.
const clients = new Map<string, { fetch: typeof fetch | undefined; client: AwsSes }>();

export function sesClient(region: string, env: Env, fetchImpl?: typeof fetch): AwsSes {
  const hit = clients.get(region);
  if (hit && hit.fetch === fetchImpl) return hit.client;
  const { AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey } = env;
  const client = createAwsClient("ses", {
    region,
    fetch: fetchImpl,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });
  clients.set(region, { fetch: fetchImpl, client });
  return client;
}

export function sesTransport(env: Env, fetchImpl?: typeof fetch): SesTransport {
  if (env.SES_TRANSPORT === "memory") return memorySesTransport;
  return {
    async send(req) {
      const body = sendEmailBody(req);
      const res = await sesClient(req.region, env, fetchImpl).json<{ MessageId?: string }>(
        `https://email.${req.region}.amazonaws.com/v2/email/outbound-emails`,
        { json: body, retries: 0, timeoutMs: 10_000 },
      );
      if (!res?.MessageId) throw new Error("SES returned no MessageId");
      return { sesMessageId: res.MessageId };
    },
  };
}

const memorySent: SesSendRequest[] = [];
let memoryFailure: { err: unknown } | undefined;

export const memorySesTransport: SesTransport & {
  sent: SesSendRequest[];
  failNext(err: unknown): void;
  reset(): void;
} = {
  sent: memorySent,
  async send(req) {
    if (memoryFailure) {
      const { err } = memoryFailure;
      memoryFailure = undefined;
      throw err;
    }
    configSetFor(req.region, req.stream);
    memorySent.push(req);
    return { sesMessageId: `mem-${memorySent.length}` };
  },
  failNext(err) {
    memoryFailure = { err };
  },
  reset() {
    memorySent.length = 0;
    memoryFailure = undefined;
  },
};

const RETRYABLE_AWS_CODES = new Set(["Timeout", "MissingCredentials", "MissingRegion"]);

// fetch network failures surface as TypeError; other plain Errors (e.g. "no MessageId") are permanent.
export function isRetryableSesError(err: unknown): boolean {
  if (err instanceof AwsError) {
    return RETRYABLE_AWS_CODES.has(err.code) || err.status === 429 || (err.status ?? 0) >= 500;
  }
  return err instanceof TypeError;
}
