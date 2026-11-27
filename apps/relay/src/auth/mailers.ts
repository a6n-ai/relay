import type { Env } from "../env";
import { consoleInviteMailer, memoryInviteMailer } from "./invite-mailer";
import { consoleOtpMailer, memoryOtpMailer, type OtpMailer } from "./otp-mailer";
import { sesInviteMailer, sesOtpMailer, type InviteMailer } from "./system-mail";

type Registry<T> = Record<"memory" | "console" | "ses", (env: Env) => T>;

const otpMailers: Registry<OtpMailer> = { memory: () => memoryOtpMailer, console: () => consoleOtpMailer, ses: sesOtpMailer };
const inviteMailers: Registry<InviteMailer> = { memory: () => memoryInviteMailer, console: () => consoleInviteMailer, ses: sesInviteMailer };

function pick<T>(registry: Registry<T>, kind: string | undefined, env: Env, label: string): T {
  if (!kind || !Object.hasOwn(registry, kind)) throw new Error(`no ${label} mailer configured`);
  return registry[kind as keyof Registry<T>](env);
}

export const pickMailer = (kind: Env["OTP_MAILER"], env: Env): OtpMailer => pick(otpMailers, kind, env, "OTP");
export const pickInviteMailer = (kind: Env["INVITE_MAILER"], env: Env): InviteMailer => pick(inviteMailers, kind, env, "invite");
