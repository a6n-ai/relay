import { maskEmails, normalizeEmail } from "../../core/mask-emails";
import type { InviteMail, InviteMailer } from "./system-mail";

// The link is never logged: it carries the invitation id, which accepts the invite.
export const consoleInviteMailer: InviteMailer = {
  async send(email) {
    console.log(`[invite] sent to ${maskEmails(email)}`);
  },
};

const lastByEmail = new Map<string, InviteMail>();

export const memoryInviteMailer: InviteMailer & { lastInvite(email: string): InviteMail | undefined } = {
  async send(email, invite) {
    lastByEmail.set(normalizeEmail(email), invite);
  },
  lastInvite(email: string): InviteMail | undefined {
    return lastByEmail.get(normalizeEmail(email));
  },
};
