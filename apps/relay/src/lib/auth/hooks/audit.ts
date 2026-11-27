import { getSessionFromCtx, isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { maskEmails, normalizeEmail } from "../../../core/mask-emails";
import { securityDb } from "../../../db/security/client";
import { member } from "../../../db/security/schema";
import type { Env } from "../../../env";
import { writeAudit } from "../audit";
import { recordPasswordChange } from "../password";
import { callbackAudit } from "./oauth-link";
import type { AdminLinkState, HookCtx } from "./types";

// Audit context from the request. Organization hooks get no request, so they log without ip or user agent.
export const requestMeta = (ctx: { headers?: Headers; request?: Request }) => {
  const headers = ctx.headers ?? ctx.request?.headers;
  return { ip: headers?.get("cf-connecting-ip") ?? null, userAgent: headers?.get("user-agent") ?? null };
};
const actorOf = async (ctx: Parameters<typeof getSessionFromCtx>[0]) => (await getSessionFromCtx(ctx))?.user.id ?? null;

// Role writes from every path (set-role, update-user, seed) reach user.update.after. The request body says whether one was asked for.
// The seed has no endpoint context, so it writes its own role.change row.
export const userAuditHooks = (env: Env) => ({
  create: {
    after: async (user: { id: string; role?: string | null }, ctx: Parameters<typeof getSessionFromCtx>[0] | null) => {
      await writeAudit(env, {
        action: "user.create",
        actorUserId: ctx ? await actorOf(ctx) : null,
        target: user.id,
        data: { role: user.role },
        ...(ctx ? requestMeta(ctx) : {}),
      });
    },
  },
  update: {
    after: async (user: { id: string; role?: string | null }, ctx: (Parameters<typeof getSessionFromCtx>[0] & { path?: string; body?: unknown }) | null) => {
      const body = (ctx?.body ?? {}) as { role?: unknown; data?: { role?: unknown } };
      const roleWritten =
        (ctx?.path === "/admin/set-role" && body.role !== undefined) ||
        (ctx?.path === "/admin/update-user" && body.data?.role !== undefined);
      if (!roleWritten) return;
      await writeAudit(env, {
        action: "role.change",
        actorUserId: ctx ? await actorOf(ctx) : null,
        target: user.id,
        data: { to: user.role },
        ...(ctx ? requestMeta(ctx) : {}),
      });
    },
  },
});

export async function auditAfterRequest(env: Env, ctx: HookCtx, linkState: AdminLinkState): Promise<void> {
  const result = ctx.context.returned;
  const meta = requestMeta(ctx);
  const body = (ctx.body ?? {}) as { email?: string; userId?: string; memberId?: string; role?: string; banReason?: string };

  if (ctx.path === "/sign-in/email-otp" || ctx.path === "/sign-in/email") {
    const method = ctx.path === "/sign-in/email" ? { method: "password" } : {};
    if (isAPIError(result)) {
      await writeAudit(env, { action: "sign_in.failure", target: maskEmails(normalizeEmail(body.email)), data: { status: result.statusCode, ...method }, ...meta });
    } else {
      const signedIn = (result as { user: { id: string } }).user;
      await writeAudit(env, { action: "sign_in.success", actorUserId: signedIn.id, target: signedIn.id, data: method, ...meta });
    }
    return;
  }
  if (ctx.path.startsWith("/callback/")) return callbackAudit(env, ctx, linkState, meta);
  if (isAPIError(result)) return;

  switch (ctx.path) {
    case "/admin/remove-user":
      return writeAudit(env, { action: "user.remove", actorUserId: await actorOf(ctx), target: body.userId, ...meta });
    case "/admin/ban-user":
      return writeAudit(env, { action: "user.ban", actorUserId: await actorOf(ctx), target: body.userId, ...meta });
    case "/admin/unban-user":
      return writeAudit(env, { action: "user.unban", actorUserId: await actorOf(ctx), target: body.userId, ...meta });
    case "/organization/update-member-role": {
      // The org hook gets no request, so the acting user and the member's user are read here.
      const [m] = await securityDb(env)
        .select({ userId: member.userId, organizationId: member.organizationId })
        .from(member)
        .where(eq(member.id, body.memberId ?? ""));
      return writeAudit(env, {
        action: "member.role_change",
        actorUserId: await actorOf(ctx),
        workspaceId: m?.organizationId,
        target: m?.userId,
        data: { to: body.role },
        ...meta,
      });
    }
    case "/change-password": {
      const changed = (result as { user: { id: string; email: string } }).user;
      return recordPasswordChange(env, changed, "password.change", meta);
    }
    case "/admin/impersonate-user":
      return writeAudit(env, { action: "impersonate.start", actorUserId: await actorOf(ctx), target: body.userId, ...meta });
    case "/admin/stop-impersonating": {
      // The impersonated session is gone by now, so the admin comes from the response.
      const admin = (result as { user: { id: string } }).user;
      return writeAudit(env, { action: "impersonate.stop", actorUserId: admin.id, ...meta });
    }
  }
}
