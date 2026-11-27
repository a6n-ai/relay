import { APIError, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { normalizeEmail } from "../../core/mask-emails";
import type { Env } from "../../env";
import { emailWithinCap } from "../rate-limit";
import { needsFreshSignIn, STALE_SESSION_MESSAGE } from "../password";
import type { HookCtx } from "./types";

// Per-request refusals that run before any endpoint handler.
export async function guardRequest(env: Env, ctx: HookCtx): Promise<void> {
  // The email-otp reset flow is not used: passwords reset through the core /request-password-reset.
  const resetMail =
    ctx.path === "/email-otp/request-password-reset" ||
    ctx.path === "/forget-password/email-otp" ||
    ctx.path === "/email-otp/reset-password" ||
    (ctx.path === "/email-otp/send-verification-otp" && ctx.body?.type === "forget-password");
  if (resetMail) throw new APIError("NOT_FOUND");
  // An idToken body signs in without the OAuth redirect and its audit; only the redirect flow is allowed.
  if ((ctx.path === "/sign-in/social" || ctx.path === "/link-social") && ctx.body?.idToken) throw new APIError("FORBIDDEN");
  // better-auth's limiter keys on IP and path; this caps one address across IPs. Unknown and known addresses count alike.
  const email = normalizeEmail(ctx.body?.email);
  if (email && !(await emailWithinCap(env, ctx.path, email))) throw new APIError("TOO_MANY_REQUESTS");
  // The reset link always lands on our reset page, whatever the client asked for.
  if (ctx.path === "/request-password-reset" && ctx.body) ctx.body.redirectTo = "/reset-password";
  if (ctx.path === "/change-password") {
    const current = await getAuthoritativeSessionFromCtx(ctx);
    if (current && needsFreshSignIn(current.session)) throw new APIError("FORBIDDEN", { message: STALE_SESSION_MESSAGE });
  }
  // Keys are created by the server only: over HTTP, metadata.appId would be client-set and skip the app check.
  if (ctx.request && ctx.path.startsWith("/api-key/")) throw new APIError("NOT_FOUND");
  // recoveryEmail redirects the invite mail and appId picks the mailbox app: only inviteMember sets them, server-side.
  if (ctx.request && ctx.path === "/organization/invite-member" && (ctx.body && ("recoveryEmail" in ctx.body || "mailboxName" in ctx.body || "appId" in ctx.body)))
    throw new APIError("BAD_REQUEST", { message: "mailbox invites are server-only" });
  // Accepting must go through acceptInvite, which creates the personal mailbox and copies the recovery email.
  if (ctx.request && ctx.path === "/organization/accept-invitation") throw new APIError("BAD_REQUEST", { message: "accept through the console" });
  // A resend mails again without beforeCreateInvitation, so it would skip the daily cap.
  if (ctx.path === "/organization/invite-member" && ctx.body?.resend) throw new APIError("BAD_REQUEST", { message: "resend is not supported" });
}
