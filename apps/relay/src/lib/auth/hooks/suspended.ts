import { APIError, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { and, eq, inArray, or } from "drizzle-orm";
import { securityDb } from "../../../db/security/client";
import { invitation, team, workspace } from "../../../db/security/schema";
import type { Env } from "../../../env";
import type { HookCtx } from "./types";

// A suspended workspace keeps its sessions but loses organization endpoints. Every workspace a request names counts, not only the active one.
export async function gateSuspendedWorkspace(env: Env, ctx: HookCtx): Promise<void> {
  if (!ctx.path.startsWith("/organization/")) return;
  const b = (ctx.body ?? {}) as Record<string, unknown>, q = (ctx.query ?? {}) as Record<string, unknown>;
  const str = (v: unknown): v is string => typeof v === "string";
  // update-team reads its workspace from data.organizationId before falling back to the active one.
  const data = (b.data ?? {}) as Record<string, unknown>;
  const ids = [b.organizationId, q.organizationId, data.organizationId].filter(str);
  const slugs = [b.organizationSlug, q.organizationSlug].filter(str);
  if (str(b.invitationId)) {
    const [inv] = await securityDb(env).select({ o: invitation.organizationId }).from(invitation).where(eq(invitation.id, b.invitationId));
    if (inv) ids.push(inv.o);
  }
  // A team names its workspace. An unknown team fails closed on mutations.
  const mutation = ctx.method !== "GET";
  for (const teamId of [b.teamId, q.teamId].filter(str)) {
    const [t] = await securityDb(env).select({ o: team.organizationId }).from(team).where(eq(team.id, teamId));
    if (t) ids.push(t.o);
    else if (mutation) throw new APIError("BAD_REQUEST", { message: "team not found" });
  }
  // set-active leaves the current workspace and list shows every membership, so neither is gated by the active one.
  // Authoritative read: the cookie cache can predate a set-active, a suspension, a ban or a password reset.
  const current = await getAuthoritativeSessionFromCtx(ctx);
  // Over HTTP a mutation needs a live session row; the cached cookie alone outlives a revoke by up to 5 minutes.
  if (ctx.request && mutation && !current) throw new APIError("UNAUTHORIZED");
  if (ctx.path !== "/organization/set-active" && ctx.path !== "/organization/list") {
    const active = current?.session.activeOrganizationId;
    if (active) ids.push(active);
  }
  if (!ids.length && !slugs.length) return;
  const [hit] = await securityDb(env)
    .select({ id: workspace.id })
    .from(workspace)
    .where(
      and(
        eq(workspace.status, "suspended"),
        or(ids.length ? inArray(workspace.id, ids) : undefined, slugs.length ? inArray(workspace.slug, slugs) : undefined),
      ),
    )
    .limit(1);
  if (hit) throw new APIError("FORBIDDEN", { message: "workspace suspended" });
}
