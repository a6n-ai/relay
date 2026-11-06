/// <reference path="./nodemailer-ambient.d.ts" />
import { AwsError, awsConfigFromEnv, createAwsClient, type AwsConfig } from "@foundry/aws";
import { AppError } from "@foundry/commons";
import {
  AbstractEmailProvider,
  type EmailProviderConfig,
} from "./provider";
import { formatAddress } from "./address";
import type { PreparedEmail, SendResult } from "./types";

export interface SesProviderConfig extends EmailProviderConfig, AwsConfig {
  /**
   * SES configuration set — routes bounce/complaint/delivery events to the
   * SNS feedback topic. Required for the suppression webhook to work.
   */
  configurationSetName?: string;
}

interface SendEmailResponse { MessageId?: string }

const SEND_BUDGET = { retries: 1, timeoutMs: 10_000 };

function sesClient(config: AwsConfig) {
  const env = awsConfigFromEnv();
  return createAwsClient("ses", {
    region: config.region ?? env.region,
    credentials: config.credentials ?? env.credentials,
    fetch: config.fetch,
  });
}

// Callers catch AppError, not the signer's AwsError; an unconfigured env must fail the same way a rejected send does.
async function sesCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AwsError && (e.code === "MissingCredentials" || e.code === "MissingRegion")) {
      throw new AppError(e.message, 500);
    }
    throw e;
  }
}

export class SesEmailProvider extends AbstractEmailProvider {
  readonly name = "ses";
  private readonly aws: ReturnType<typeof createAwsClient>;
  private readonly configurationSetName?: string;

  constructor(config: SesProviderConfig) {
    super(config);
    this.aws = sesClient(config);
    this.configurationSetName = config.configurationSetName;
  }

  protected async deliver(message: PreparedEmail): Promise<SendResult> {
    const to = Array.isArray(message.to) ? message.to : [message.to];
    const body = {
      FromEmailAddress: formatAddress(message.from),
      Destination: {
        ToAddresses: to.map(formatAddress),
        CcAddresses: message.cc?.map(formatAddress),
        BccAddresses: message.bcc?.map(formatAddress),
      },
      ReplyToAddresses: message.replyTo ? [formatAddress(message.replyTo)] : undefined,
      ConfigurationSetName: this.configurationSetName,
      EmailTags: message.tags ? Object.entries(message.tags).map(([Name, Value]) => ({ Name, Value })) : undefined,
      // SESv2's Simple content has no attachment field at all, so any message
      // carrying one must go through Raw (a hand-assembled MIME document)
      // instead — the two are mutually exclusive send paths, not a superset.
      Content:
        message.attachments && message.attachments.length > 0
          ? { Raw: { Data: (await buildRawMessage(message)).toString("base64") } }
          : {
              Simple: {
                Subject: { Data: message.subject, Charset: "UTF-8" },
                Headers: message.headers
                  ? Object.entries(message.headers).map(([Name, Value]) => ({ Name, Value }))
                  : undefined,
                Body: {
                  Html: message.html ? { Data: message.html, Charset: "UTF-8" } : undefined,
                  Text: message.text ? { Data: message.text, Charset: "UTF-8" } : undefined,
                },
              },
            },
    };

    // Region is read inside the call: the client throws MissingRegion lazily.
    const out = await sesCall(() =>
      this.aws.json<SendEmailResponse>(
        `https://email.${this.aws.region}.amazonaws.com/v2/email/outbound-emails`,
        { method: "POST", json: body, ...SEND_BUDGET },
      ),
    );
    if (!out?.MessageId) {
      throw new AppError("SES returned no MessageId", 502);
    }
    return { providerMessageId: out.MessageId, provider: this.name };
  }
}

export interface SesSendQuota {
  /** Max sends allowed in a rolling 24h window. */
  max24HourSend: number;
  /** Sends already used in the current 24h window. */
  sentLast24Hours: number;
  /** Max sends per second. */
  maxSendRate: number;
  /** False in the SES sandbox (200/day, verified recipients only) until production access is granted. */
  productionAccessEnabled: boolean;
}

/**
 * Account-wide SES sending limits — surfaced in the campaigns UI so an admin
 * can see headroom before a large send, not just find out from a bounced
 * SendEmail call mid-campaign.
 */
export async function getSesSendQuota(config: AwsConfig = {}): Promise<SesSendQuota> {
  const aws = sesClient(config);
  const out = await sesCall(() =>
    aws.json<{
      SendQuota?: { Max24HourSend?: number; SentLast24Hours?: number; MaxSendRate?: number };
      ProductionAccessEnabled?: boolean;
    }>(`https://email.${aws.region}.amazonaws.com/v2/email/account`, { method: "GET", ...SEND_BUDGET }),
  );
  const quota = out?.SendQuota ?? {};
  return {
    max24HourSend: quota.Max24HourSend ?? 0,
    sentLast24Hours: quota.SentLast24Hours ?? 0,
    maxSendRate: quota.MaxSendRate ?? 0,
    productionAccessEnabled: out?.ProductionAccessEnabled ?? false,
  };
}

async function buildRawMessage(message: PreparedEmail): Promise<Buffer> {
  const to = Array.isArray(message.to) ? message.to : [message.to];
  // nodemailer's MailComposer assembles a valid MIME document without a
  // transport — used here purely as a MIME builder, nothing is sent over SMTP.
  const { default: MailComposer } = await import("nodemailer/lib/mail-composer/index.js");
  const mail = new MailComposer({
    from: formatAddress(message.from),
    to: to.map(formatAddress),
    cc: message.cc?.map(formatAddress),
    bcc: message.bcc?.map(formatAddress),
    replyTo: message.replyTo ? formatAddress(message.replyTo) : undefined,
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers: message.headers,
    attachments: message.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, "base64"),
      contentType: a.contentType,
    })),
  });
  return new Promise((resolve, reject) => {
    mail.compile().build((err: Error | null, buffer: Buffer) => {
      if (err) reject(err);
      else resolve(buffer);
    });
  });
}
