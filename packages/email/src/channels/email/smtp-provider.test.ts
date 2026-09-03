import { describe, expect, it, vi } from "vitest";
import { AppError } from "@foundry/commons";
import { SmtpEmailProvider, type SmtpSendClient } from "./smtp-provider";

const defaultFrom = { email: "noreply@tiffingrab.ca", name: "Tiffin Grab" };

describe("SmtpEmailProvider", () => {
  it("maps a message onto sendMail and returns the messageId", async () => {
    const sent: unknown[] = [];
    const client: SmtpSendClient = {
      sendMail: vi.fn(async (opts) => {
        sent.push(opts);
        return { messageId: "<smtp-1@relay>" };
      }),
    };
    const p = new SmtpEmailProvider({
      defaultFrom,
      host: "smtp.example.com",
      client,
    });

    const res = await p.send({
      to: { email: "cust@example.com", name: "Cust" },
      subject: "Order confirmed",
      html: "<p>hi</p>",
    });

    expect(res).toEqual({ providerMessageId: "<smtp-1@relay>", provider: "smtp" });
    expect(sent[0]).toMatchObject({
      from: "Tiffin Grab <noreply@tiffingrab.ca>",
      to: ["Cust <cust@example.com>"],
      subject: "Order confirmed",
      html: "<p>hi</p>",
    });
  });

  it("passes cc, bcc, and replyTo", async () => {
    const sent: unknown[] = [];
    const p = new SmtpEmailProvider({
      defaultFrom,
      host: "smtp.example.com",
      client: {
        sendMail: async (opts) => {
          sent.push(opts);
          return { messageId: "<id>" };
        },
      },
    });
    await p.send({
      to: [{ email: "a@b.com" }, { email: "c@d.com", name: "C" }],
      cc: [{ email: "cc@x.com" }],
      bcc: [{ email: "bcc@x.com" }],
      replyTo: { email: "ops@x.com" },
      subject: "x",
      text: "y",
    });
    expect(sent[0]).toMatchObject({
      to: ["a@b.com", "C <c@d.com>"],
      cc: ["cc@x.com"],
      bcc: ["bcc@x.com"],
      replyTo: "ops@x.com",
    });
  });

  it("passes a Message-ID through as nodemailer messageId", async () => {
    const sent: unknown[] = [];
    const p = new SmtpEmailProvider({
      defaultFrom,
      host: "smtp.example.com",
      client: {
        sendMail: async (opts) => {
          sent.push(opts);
          return { messageId: opts.messageId ?? "<generated@smtp>" };
        },
      },
    });
    await p.send({
      to: { email: "a@b.com" },
      subject: "x",
      text: "y",
      rfcMessageId: "<abc@relay.test>",
    });
    expect(sent[0]).toMatchObject({ messageId: "<abc@relay.test>" });
  });

  it("passes In-Reply-To and References so a reply stays one conversation", async () => {
    const sent: unknown[] = [];
    const p = new SmtpEmailProvider({
      defaultFrom,
      host: "smtp.example.com",
      client: {
        sendMail: async (opts) => {
          sent.push(opts);
          return { messageId: "<id>" };
        },
      },
    });
    await p.send({
      to: { email: "a@b.com" },
      subject: "Re: x",
      text: "y",
      inReplyTo: "<abc@relay.test>",
      rfcReferences: "<abc@relay.test>",
    });
    expect(sent[0]).toMatchObject({
      inReplyTo: "<abc@relay.test>",
      references: "<abc@relay.test>",
    });
  });

  it("throws when SMTP returns no messageId", async () => {
    const client: SmtpSendClient = { sendMail: async () => ({}) };
    const p = new SmtpEmailProvider({ defaultFrom, host: "smtp.example.com", client });
    await expect(
      p.send({ to: { email: "a@b.com" }, subject: "x", text: "y" }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
