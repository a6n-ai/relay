import type { Env } from "../env";
import { writeAudit } from "./audit";
import { pickMailer } from "./mailers";

// A password is a lasting credential, so setting or changing one needs a sign-in from the last 10 minutes.
const FRESH_SESSION_MS = 10 * 60_000;
export const STALE_SESSION_MESSAGE = "Sign in again to set a password.";
export const isFreshSession = (createdAt: Date | string | number) => Date.now() - new Date(createdAt).getTime() <= FRESH_SESSION_MS;
// An impersonated session never sets a password, however new it is.
export const needsFreshSignIn = (s: { impersonatedBy?: string | null; createdAt: Date | string | number }) => Boolean(s.impersonatedBy) || !isFreshSession(s.createdAt);

// Audit row plus a notice mail. The change has already committed, so a failed notice is logged (no address) and never fails the caller.
export async function recordPasswordChange(
  env: Env,
  u: { id: string; email: string },
  action: "password.set" | "password.change" | "password.reset",
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await writeAudit(env, { action, actorUserId: u.id, target: u.id, ...meta });
  try {
    await pickMailer(env.OTP_MAILER, env).send(u.email, "", "password-changed");
  } catch (error) {
    console.error(`password notice failed: ${action}: ${error instanceof Error ? error.message : "unknown"}`);
  }
}
