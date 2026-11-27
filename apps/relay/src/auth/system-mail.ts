import { AwsError } from "@foundry/cloud";
import { sesTransport } from "../core/ses";
import type { Env } from "../env";
import type { OtpMailer } from "./otp-mailer";

// Never logs the code, the link or the address: the mail itself is the only copy.
function systemSend(env: Env) {
  const { SYSTEM_FROM_EMAIL: from, SYSTEM_SES_REGION: region, SYSTEM_FROM_NAME: name } = env;
  if (!from || !region) throw new Error("system mail not configured");
  const transport = sesTransport(env);
  return async (mail: { to: string; subject: string; text: string; html: string }) => {
    try {
      await transport.send({ ...mail, region, stream: "transactional", from, fromName: name || null });
    } catch (err) {
      // SES replies can quote the recipient, and better-auth logs a non-APIError whole: keep only the AWS code and status.
      throw new Error(err instanceof AwsError ? `system mail failed: ${err.code}/${err.status ?? "none"}` : "system mail failed");
    }
  };
}

export function sesOtpMailer(env: Env): OtpMailer {
  return {
    async send(email, otp, type) {
      // For a reset, the mailer's second argument is the reset link, not a code.
      if (type === "reset-password") {
        const sentence = "Reset your Relay password with this link. It expires in 1 hour. If you did not ask for it, ignore this email.";
        return systemSend(env)({
          to: email,
          subject: "Reset your Relay password",
          text: `${sentence} ${otp}`,
          html: `<p>${sentence}</p><p><a href="${otp}">Reset your password</a></p>`,
        });
      }
      if (type === "password-changed") {
        const notice = "Your Relay password was set or changed. If this wasn't you, reset it and contact your workspace owner.";
        return systemSend(env)({ to: email, subject: "Your Relay password changed", text: notice, html: `<p>${notice}</p>` });
      }
      const lead = "Your Relay sign-in code is";
      const tail = "It expires in 10 minutes. If you did not ask for it, ignore this email.";
      await systemSend(env)({
        to: email,
        subject: "Your Relay sign-in code",
        text: `${lead} ${otp}. ${tail}`,
        html: `<p>${lead} <strong>${otp}</strong>. ${tail}</p>`,
      });
    },
  };
}

export type InviteMail = { id: string; role: string };
export type InviteMailer = { send(email: string, invite: InviteMail): Promise<void> };

export function sesInviteMailer(env: Env): InviteMailer {
  return {
    async send(email, invite) {
      const link = `${env.BETTER_AUTH_URL}/invite/${invite.id}`;
      const sentence = `You have been invited to join a Relay workspace as ${invite.role}.`;
      await systemSend(env)({
        to: email,
        subject: "You're invited to a Relay workspace",
        text: `${sentence} Accept: ${link}`,
        html: `<p>${sentence} Accept: <a href="${link}">${link}</a></p>`,
      });
    },
  };
}
