import type { Env } from "../../env";
import { sesInviteMailer, type InviteMail, type InviteMailer } from "./system-mail";

// The link is never logged: it carries the invitation id, which accepts the invite.
export const consoleInviteMailer: InviteMailer = {
  async send(email) {
    const masked = email.replace(/^[^@]*/, (local) => `${local.charAt(0)}***`);
    console.log(`[invite] sent to ${masked}`);
  },
};

const lastByEmail = new Map<string, InviteMail>();

export const memoryInviteMailer: InviteMailer & { lastInvite(email: string): InviteMail | undefined } = {
  async send(email, invite) {
    lastByEmail.set(email.trim().toLowerCase(), invite);
  },
  lastInvite(email: string): InviteMail | undefined {
    return lastByEmail.get(email.trim().toLowerCase());
  },
};

export function pickInviteMailer(kind: Env["INVITE_MAILER"], env: Env): InviteMailer {
  if (kind === "memory") return memoryInviteMailer;
  if (kind === "console") return consoleInviteMailer;
  if (kind === "ses") return sesInviteMailer(env);
  throw new Error("no invite mailer configured");
}
