/// <reference path="./nodemailer-ambient.d.ts" />
import {
  GetAccountCommand,
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandOutput,
} from "@aws-sdk/client-sesv2";
import { AppError } from "@foundry/commons";
import {
  AbstractEmailProvider,
  type EmailProviderConfig,
} from "./provider";
import { formatAddress } from "./address";
import type { PreparedEmail, SendResult } from "./types";

/** Minimal slice of SESv2Client we use — lets tests inject a fake. */
export interface SesSendClient {
  send(command: SendEmailCommand): Promise<SendEmailCommandOutput>;
}

export interface SesProviderConfig extends EmailProviderConfig {
  /** AWS region, e.g. "us-east-1". Ignored when a client is injected. */
  region?: string;
  /**
   * SES configuration set — routes bounce/complaint/delivery events to the
   * SNS feedback topic. Required for the suppression webhook to work.
   */
  configurationSetName?: string;
  /** Inject for tests; otherwise a real SESv2Client is built (IAM role creds). */
  client?: SesSendClient;
}

export class SesEmailProvider extends AbstractEmailProvider {
  readonly name = "ses";
  private readonly client: SesSendClient;
  private readonly configurationSetName?: string;

  constructor(config: SesProviderConfig) {
    super(config);
    this.client = config.client ?? new SESv2Client({ region: config.region });
    this.configurationSetName = config.configurationSetName;
  }

  protected async deliver(message: PreparedEmail): Promise<SendResult> {
    const to = Array.isArray(message.to) ? message.to : [message.to];
    const command = new SendEmailCommand({
      FromEmailAddress: formatAddress(message.from),
      Destination: {
        ToAddresses: to.map(formatAddress),
        CcAddresses: message.cc?.map(formatAddress),
        BccAddresses: message.bcc?.map(formatAddress),
      },
      ReplyToAddresses: message.replyTo ? [formatAddress(message.replyTo)] : undefined,
      ConfigurationSetName: this.configurationSetName,
      // SESv2's Simple content has no attachment field at all, so any message
      // carrying one must go through Raw (a hand-assembled MIME document)
      // instead — the two are mutually exclusive send paths, not a superset.
      Content:
        message.attachments && message.attachments.length > 0
          ? { Raw: { Data: await buildRawMessage(message) } }
          : {
              Simple: {
                Subject: { Data: message.subject, Charset: "UTF-8" },
                Body: {
                  Html: message.html ? { Data: message.html, Charset: "UTF-8" } : undefined,
                  Text: message.text ? { Data: message.text, Charset: "UTF-8" } : undefined,
                },
              },
            },
    });

    const out = await this.client.send(command);
    if (!out.MessageId) {
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
export async function getSesSendQuota(config: { region?: string; client?: SESv2Client } = {}): Promise<SesSendQuota> {
  const client = config.client ?? new SESv2Client({ region: config.region });
  const out = await client.send(new GetAccountCommand({}));
  const quota = out.SendQuota ?? {};
  return {
    max24HourSend: quota.Max24HourSend ?? 0,
    sentLast24Hours: quota.SentLast24Hours ?? 0,
    maxSendRate: quota.MaxSendRate ?? 0,
    productionAccessEnabled: out.ProductionAccessEnabled ?? false,
  };
}

async function buildRawMessage(message: PreparedEmail): Promise<Uint8Array> {
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
    attachments: message.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, "base64"),
      contentType: a.contentType,
    })),
  });
  return new Promise((resolve, reject) => {
    mail.compile().build((err: Error | null, buffer: Buffer) => {
      if (err) reject(err);
      else resolve(new Uint8Array(buffer));
    });
  });
}
