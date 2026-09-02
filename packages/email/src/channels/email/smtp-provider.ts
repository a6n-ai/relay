import { AppError } from "@foundry/commons";
import { AbstractEmailProvider, type EmailProviderConfig } from "./provider";
import { formatAddress } from "./address";
import type { PreparedEmail, SendResult } from "./types";

/** Minimal nodemailer-compatible transport so tests can inject a fake. */
export interface SmtpMailInfo {
  messageId?: string;
}

export interface SmtpMailOptions {
  from: string;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  messageId?: string;
}

export interface SmtpSendClient {
  sendMail(options: SmtpMailOptions): Promise<SmtpMailInfo>;
}

export interface SmtpDkimConfig {
  domainName: string;
  keySelector: string;
  privateKey: string;
}

export interface SmtpProviderConfig extends EmailProviderConfig {
  host: string;
  port?: number;
  secure?: boolean;
  auth?: { user: string; pass: string };
  dkim?: SmtpDkimConfig;
  /** Inject for tests; otherwise nodemailer is used. */
  client?: SmtpSendClient;
}

async function defaultTransport(config: SmtpProviderConfig): Promise<SmtpSendClient> {
  const nodemailer = await import("nodemailer");
  return nodemailer.createTransport({
    host: config.host,
    port: config.port ?? 587,
    secure: config.secure ?? false,
    auth: config.auth,
    dkim: config.dkim,
  });
}

export class SmtpEmailProvider extends AbstractEmailProvider {
  readonly name = "smtp";
  private readonly client?: SmtpSendClient;
  private transportPromise?: Promise<SmtpSendClient>;

  constructor(private readonly smtp: SmtpProviderConfig) {
    super(smtp);
    this.client = smtp.client;
  }

  private async transport(): Promise<SmtpSendClient> {
    if (this.client) return this.client;
    this.transportPromise ??= defaultTransport(this.smtp);
    return this.transportPromise;
  }

  protected async deliver(message: PreparedEmail): Promise<SendResult> {
    const to = Array.isArray(message.to) ? message.to : [message.to];
    const info = await (await this.transport()).sendMail({
      from: formatAddress(message.from),
      to: to.map(formatAddress),
      cc: message.cc?.map(formatAddress),
      bcc: message.bcc?.map(formatAddress),
      replyTo: message.replyTo ? formatAddress(message.replyTo) : undefined,
      subject: message.subject,
      html: message.html,
      text: message.text,
      messageId: message.rfcMessageId,
    });
    if (!info.messageId) {
      throw new AppError("SMTP returned no messageId", 502);
    }
    return { providerMessageId: info.messageId, provider: this.name };
  }
}
