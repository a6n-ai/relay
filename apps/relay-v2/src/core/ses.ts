import { AwsError, createAwsClient } from "@foundry/cloud";
import type { Env } from "../env";

export type Stream = "transactional" | "tracked" | "marketing";

export const SES_CONFIG_SETS = {
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
} as const;

export function configSetFor(region: string, stream: Stream): string {
  if (!Object.hasOwn(SES_CONFIG_SETS, region)) throw new Error(`no SES config set for region ${region}`);
  return SES_CONFIG_SETS[region as keyof typeof SES_CONFIG_SETS][stream];
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
};

export type SesTransport = { send(req: SesSendRequest): Promise<{ sesMessageId: string }> };

export const MAX_SEND_ATTEMPTS = 5;

export function retryDelaySeconds(attempt: number): number {
  return Math.min(30 * 2 ** (attempt - 1), 900);
}

// Same From format as channels/email/address.ts (unquoted).
export function sendEmailBody(req: SesSendRequest) {
  return {
    FromEmailAddress: req.fromName ? `${req.fromName} <${req.from}>` : req.from,
    Destination: { ToAddresses: [req.to] },
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
      },
    },
  };
}

type AwsSes = ReturnType<typeof createAwsClient>;

// Keyed by fetch as well as region so an injected fetch is never served a client bound to another.
const clients = new Map<string, { fetch: typeof fetch | undefined; client: AwsSes }>();

function clientFor(region: string, env: Env, fetchImpl: typeof fetch | undefined): AwsSes {
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
      const res = await clientFor(req.region, env, fetchImpl).json<{ MessageId?: string }>(
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
