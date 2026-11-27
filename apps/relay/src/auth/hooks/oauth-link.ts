import { getOAuthState } from "better-auth/api";
import { eq } from "drizzle-orm";
import { securityDb } from "../../db/security/client";
import { user } from "../../db/security/schema";
import type { Env } from "../../env";
import { writeAudit } from "../audit";
import { ADMIN_LINK_CODE, auditKindFor, refusesImplicitLink } from "../google";
import type { AdminLinkState, HookCtx } from "./types";

// Both Google flows insert the account row here. A banned user gets none, and a platform admin gets none from the sign-in callback:
// linking Google to an admin is only allowed through /link-social, whose OAuth state carries `link` (server-set, not client additionalData).
// false aborts the insert; callbackAudit turns the resulting redirect error into ADMIN_LINK_CODE.
export const accountCreateBefore = (env: Env, linkState: AdminLinkState) => async (acct: { providerId: string; userId: string }) => {
  if (acct.providerId === "credential") return;
  const [u] = await securityDb(env).select({ banned: user.banned, role: user.role }).from(user).where(eq(user.id, acct.userId));
  if (u?.banned) return false;
  const state = await getOAuthState().catch(() => null);
  if (refusesImplicitLink(u?.role, state?.link ? "link" : "sign-in")) {
    linkState.refused = true;
    return false;
  }
};

// After a /callback/* request: audits the link or the sign-in, and rewrites a refused admin link into ADMIN_LINK_CODE.
export async function callbackAudit(env: Env, ctx: HookCtx, linkState: AdminLinkState, meta: { ip: string | null; userAgent: string | null }): Promise<void> {
  const result = ctx.context.returned;
  const state = await getOAuthState().catch(() => null);
  if (auditKindFor(ctx.path, state) === "account.link") {
    const location = (result as { headers?: Headers } | null)?.headers?.get("location");
    const ok = !(location ? new URL(location, "http://x") : null)?.searchParams.has("error");
    await writeAudit(env, { action: "account.link", actorUserId: state!.link!.userId, target: state!.link!.userId, data: { provider: ctx.params?.id, ok }, ...meta });
    return;
  }
  const signedIn = ctx.context.newSession?.user;
  if (signedIn) {
    await writeAudit(env, { action: "sign_in.success", actorUserId: signedIn.id, target: signedIn.id, data: { provider: ctx.params?.id }, ...meta });
    return;
  }
  const location = (result as { headers?: Headers } | null)?.headers?.get("location");
  const target = location ? new URL(location, "http://x") : null;
  if (target && linkState.refused) target.searchParams.set("error", ADMIN_LINK_CODE);
  const error = target?.searchParams.get("error")?.slice(0, 64) ?? null;
  await writeAudit(env, { action: "sign_in.failure", data: { provider: ctx.params?.id, error }, ...meta });
  if (target && linkState.refused) throw ctx.redirect(location!.startsWith("/") ? target.pathname + target.search : target.href);
}
