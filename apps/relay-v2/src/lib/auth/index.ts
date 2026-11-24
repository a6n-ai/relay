import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx, getSessionFromCtx, isAPIError } from "better-auth/api";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey as apiKeyPlugin } from "@better-auth/api-key";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";
import { organization } from "better-auth/plugins/organization";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { countSelfServeOwned, ensureWorkspaceProfile, SELF_SERVE_WORKSPACE_CAP } from "../../core/workspace-profile";
import { coreDb } from "../../db/core/client";
import { address, sendingDomain } from "../../db/core/schema";
import { securityDb } from "../../db/security/client";
import {
  account,
  apiKey,
  app,
  invitation,
  member,
  session,
  team,
  teamMember,
  user,
  rateLimit,
  verification,
  workspace,
} from "../../db/security/schema";
import type { Env } from "../../env";
import { newId } from "../ids";
import { writeAudit } from "./audit";
import { pickInviteMailer } from "./invite-mailer";
import { type OtpMailer, consoleOtpMailer, memoryOtpMailer } from "./otp-mailer";
import { ac as platformAc, orgAc, orgRoles, roles as platformRoles } from "./permissions";
import { sesOtpMailer } from "./system-mail";

const ID_PREFIX: Record<string, string> = {
  user: "usr",
  session: "ses",
  account: "acc",
  verification: "vrf",
  organization: "wsp",
  workspace: "wsp",
  member: "mbr",
  invitation: "inv",
  team: "tea",
  teamMember: "tmm",
  rateLimit: "rtl",
  apikey: "key",
};

const DAY_S = 24 * 60 * 60;
const OTP_EMAIL_WINDOW_MS = 600_000;
const OTP_EMAIL_MAX = 5;

export function pickMailer(kind: Env["OTP_MAILER"], env: Env): OtpMailer {
  if (kind === "memory") return memoryOtpMailer;
  if (kind === "console") return consoleOtpMailer;
  if (kind === "ses") return sesOtpMailer(env);
  throw new Error("no OTP mailer configured");
}

// better-auth's limiter keys on IP and path, so rotating IPs could mail-bomb one address. One upsert keeps the count race-free.
async function otpEmailWithinCap(env: Env, email: string): Promise<boolean> {
  const now = Date.now();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expired = sql`${rateLimit.lastRequest} < ${now - OTP_EMAIL_WINDOW_MS}`;
  const [row] = await securityDb(env)
    .insert(rateLimit)
    .values({ id: newId("rtl"), key: `otp-email:${hex}`, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimit.count} + 1 END`,
        lastRequest: sql`CASE WHEN ${expired} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
      },
    })
    .returning({ count: rateLimit.count });
  return row.count <= OTP_EMAIL_MAX;
}

export function createAuth(env: Env) {
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_SECRET and BETTER_AUTH_URL are required");
  }
  // input: false keeps status server-set; a client cannot choose it on create.
  const serverOnly = { input: false } as const;

  // Audit context from the request. Organization hooks get no request, so they log without ip or user agent.
  const requestMeta = (ctx: { headers?: Headers; request?: Request }) => {
    const headers = ctx.headers ?? ctx.request?.headers;
    return { ip: headers?.get("cf-connecting-ip") ?? null, userAgent: headers?.get("user-agent") ?? null };
  };
  const actorOf = async (ctx: Parameters<typeof getSessionFromCtx>[0]) =>
    (await getSessionFromCtx(ctx))?.user.id ?? null;

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(securityDb(env), {
      provider: "sqlite",
      schema: {
        user,
        session,
        account,
        verification,
        workspace,
        member,
        invitation,
        team,
        teamMember,
        rateLimit,
        apikey: apiKey,
      },
    }),
    advanced: {
      useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      database: {
        generateId: ({ model }) => newId(ID_PREFIX[model] ?? model),
      },
    },
    // Workers Rate Limiting cannot express a 600 s window, so auth uses the database store.
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/get-session": false,
        "/email-otp/send-verification-otp": { window: 600, max: 5 },
        "/sign-in/email-otp": { window: 600, max: 5 },
        "/email-otp/check-verification-otp": { window: 600, max: 5 },
      },
    },
    // Role writes from every path (set-role, update-user, seed) reach user.update.after. The request body says whether one was asked for.
    // The seed has no endpoint context, so it writes its own role.change row.
    databaseHooks: {
      user: {
        create: {
          after: async (user, ctx) => {
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
          after: async (user, ctx) => {
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
      },
    },
    // Relay has no passwords, so these paths only mail OTPs to existing users. Blocked before the handler runs.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const resetMail =
          ctx.path === "/email-otp/request-password-reset" ||
          ctx.path === "/forget-password/email-otp" ||
          ctx.path === "/email-otp/reset-password" ||
          (ctx.path === "/email-otp/send-verification-otp" && ctx.body?.type === "forget-password");
        if (resetMail) throw new APIError("NOT_FOUND");
        if (ctx.path === "/email-otp/send-verification-otp") {
          const otpEmail = String(ctx.body?.email ?? "").trim().toLowerCase();
          if (otpEmail && !(await otpEmailWithinCap(env, otpEmail))) throw new APIError("TOO_MANY_REQUESTS");
        }
        // Keys are created by the server only: over HTTP, metadata.appId would be client-set and skip the app check.
        if (ctx.request && ctx.path.startsWith("/api-key/")) throw new APIError("NOT_FOUND");

        // A suspended workspace keeps its sessions but loses organization endpoints. Every workspace a request names counts, not only the active one.
        if (ctx.path.startsWith("/organization/")) {
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
          if (ctx.path !== "/organization/set-active" && ctx.path !== "/organization/list") {
            // Authoritative read: the cookie cache can predate a set-active or a suspension.
            const active = (await getAuthoritativeSessionFromCtx(ctx))?.session.activeOrganizationId;
            if (active) ids.push(active);
          }
          if (ids.length || slugs.length) {
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
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const result = ctx.context.returned;
        const meta = requestMeta(ctx);
        const body = (ctx.body ?? {}) as { email?: string; userId?: string; memberId?: string; role?: string; banReason?: string };

        if (ctx.path === "/sign-in/email-otp") {
          if (isAPIError(result)) {
            const email = String(body.email ?? "").trim().toLowerCase();
            await writeAudit(env, { action: "sign_in.failure", target: email, data: { status: result.statusCode }, ...meta });
          } else {
            const signedIn = (result as { user: { id: string } }).user;
            await writeAudit(env, { action: "sign_in.success", actorUserId: signedIn.id, target: signedIn.id, ...meta });
          }
          return;
        }
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
          case "/admin/impersonate-user":
            return writeAudit(env, { action: "impersonate.start", actorUserId: await actorOf(ctx), target: body.userId, ...meta });
          case "/admin/stop-impersonating": {
            // The impersonated session is gone by now, so the admin comes from the response.
            const admin = (result as { user: { id: string } }).user;
            return writeAudit(env, { action: "impersonate.stop", actorUserId: admin.id, ...meta });
          }
        }
      }),
    },
    session: {
      expiresIn: 30 * DAY_S,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    plugins: [
      admin({ ac: platformAc, roles: platformRoles }),
      // Org-owned keys: referenceId is the workspace. Verified against D1 on every call, so revocation is immediate.
      apiKeyPlugin({ references: "organization", defaultPrefix: "rk_", enableMetadata: true, rateLimit: { enabled: false } }),
      emailOTP({
        disableSignUp: true,
        storeOTP: "hashed",
        allowedAttempts: 5,
        expiresIn: 600,
        sendVerificationOTP: async ({ email, otp, type }) => {
          await pickMailer(env.OTP_MAILER, env).send(email, otp, type);
        },
      }),
      organization({
        // Any signed-in user may create a workspace; beforeCreateOrganization caps a plain user's self-serve ones. The creator becomes owner.
        allowUserToCreateOrganization: true,
        ac: orgAc,
        roles: orgRoles,
        teams: { enabled: true, defaultTeam: { enabled: false }, allowRemovingAllTeams: true },
        sendInvitationEmail: async ({ id, email, role }) => {
          await pickInviteMailer(env.INVITE_MAILER, env).send(email, { id, role });
        },
        organizationHooks: {
          beforeCreateOrganization: async ({ user }) => {
            if (user.role === "admin") return;
            // shortcut: cap is checked across two D1s without a lock, a race can exceed it by one; add a security-side counter if abuse shows up
            if ((await countSelfServeOwned(env, user.id)) >= SELF_SERVE_WORKSPACE_CAP)
              throw new APIError("FORBIDDEN", { message: `You can create up to ${SELF_SERVE_WORKSPACE_CAP} workspaces` });
          },
          beforeDeleteOrganization: async ({ organization }) => {
            const [hit] = await securityDb(env)
              .select({ id: app.id })
              .from(app)
              .where(eq(app.workspaceId, organization.id))
              .limit(1);
            if (hit) throw new APIError("BAD_REQUEST", { message: "workspace still has apps" });
            // Addresses live in relay-core, so the foreign key cannot guard this delete.
            const [addr] = await coreDb(env)
              .select({ id: address.id })
              .from(address)
              .where(eq(address.workspaceId, organization.id))
              .limit(1);
            if (addr) throw new APIError("BAD_REQUEST", { message: "workspace still has addresses" });
            const [domain] = await coreDb(env)
              .select({ id: sendingDomain.id })
              .from(sendingDomain)
              .where(eq(sendingDomain.workspaceId, organization.id))
              .limit(1);
            if (domain) throw new APIError("BAD_REQUEST", { message: "workspace still has sending domains" });
          },
          afterCreateOrganization: async ({ organization, user }) => {
            try {
              await ensureWorkspaceProfile(env, organization.id, { selfServe: user.role !== "admin" });
            } catch (error) {
              // Repair-on-read creates the missing profile later.
              console.error(`workspace profile failed: workspace.create: ${error instanceof Error ? error.message : String(error)}`);
            }
            await writeAudit(env, { action: "workspace.create", actorUserId: user.id, workspaceId: organization.id, target: organization.id });
          },
          afterDeleteOrganization: async ({ organization, user }) => {
            await writeAudit(env, { action: "workspace.delete", actorUserId: user.id, workspaceId: organization.id, target: organization.id });
          },
          afterCreateInvitation: async ({ invitation, inviter, organization }) => {
            await writeAudit(env, { action: "invite.create", actorUserId: inviter.id, workspaceId: organization.id, target: invitation.email, data: { role: invitation.role } });
          },
          afterAcceptInvitation: async ({ invitation, user, organization }) => {
            await writeAudit(env, { action: "invite.accept", actorUserId: user.id, workspaceId: organization.id, target: invitation.email });
          },
          afterCancelInvitation: async ({ invitation, cancelledBy, organization }) => {
            await writeAudit(env, { action: "invite.cancel", actorUserId: cancelledBy.id, workspaceId: organization.id, target: invitation.email });
          },
          afterAddMember: async ({ member, user, organization }) => {
            await writeAudit(env, { action: "member.add", workspaceId: organization.id, target: user.id, data: { role: member.role } });
          },
          afterRemoveMember: async ({ user, organization }) => {
            await writeAudit(env, { action: "member.remove", workspaceId: organization.id, target: user.id });
          },
        },
        schema: {
          organization: {
            modelName: "workspace",
            additionalFields: {
              status: { type: "string", defaultValue: "active", required: false, ...serverOnly },
            },
          },
        },
      }),
    ],
  });
}
