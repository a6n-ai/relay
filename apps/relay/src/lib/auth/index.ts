import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx, getOAuthState, getSessionFromCtx, isAPIError } from "better-auth/api";
import { betterAuth } from "better-auth";
import { waitUntil } from "cloudflare:workers";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey as apiKeyPlugin } from "@better-auth/api-key";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";
import { organization } from "better-auth/plugins/organization";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { countSelfServeCreatedBy, ensureWorkspaceProfile, SELF_SERVE_WORKSPACE_CAP } from "../../core/workspace-profile";
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
import { newId } from "../../shared/ids";
import { maskEmails } from "../../core/mask-emails";
import { writeAudit } from "./audit";
import { ADMIN_LINK_CODE, auditKindFor, googleConfig, refusesImplicitLink } from "./google";
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
const RESET_TTL_S = 3600;

export function pickMailer(kind: Env["OTP_MAILER"], env: Env): OtpMailer {
  if (kind === "memory") return memoryOtpMailer;
  if (kind === "console") return consoleOtpMailer;
  if (kind === "ses") return sesOtpMailer(env);
  throw new Error("no OTP mailer configured");
}

// better-auth's limiter keys on IP and path, so rotating IPs could mail-bomb one address. One upsert keeps the count race-free.
async function emailWithinCap(env: Env, scope: string, email: string, max = OTP_EMAIL_MAX): Promise<boolean> {
  const now = Date.now();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expired = sql`${rateLimit.lastRequest} < ${now - OTP_EMAIL_WINDOW_MS}`;
  const [row] = await securityDb(env)
    .insert(rateLimit)
    .values({ id: newId("rtl"), key: `${scope}:${hex}`, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimit.count} + 1 END`,
        lastRequest: sql`CASE WHEN ${expired} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
      },
    })
    .returning({ count: rateLimit.count });
  return row.count <= max;
}

// A password is a lasting credential, so setting or changing one needs a sign-in from the last 10 minutes.
const FRESH_SESSION_MS = 10 * 60_000;
export const STALE_SESSION_MESSAGE = "Sign in again to set a password.";
export const isFreshSession = (createdAt: Date | string | number) => Date.now() - new Date(createdAt).getTime() <= FRESH_SESSION_MS;

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

  const google = googleConfig(env);
  // createAuth runs once per request, so this flag only ever describes the current callback.
  let adminLinkRefused = false;

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    // Expired or replayed OAuth state and other API errors land on our sign-in page, not the default error page.
    onAPIError: { errorURL: "/sign-in" },
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
    // Invite-only: Google never creates a user (disableSignUp), and a Google email with no user row is refused with signup_disabled.
    // google is deliberately not in trustedProviders: that would link on an unverified Google email. Without it, linking needs Google's email_verified.
    // Invites pre-create users with emailVerified false, so the local-verified requirement is off; the OTP sign-in keeps working for the same row.
    ...(google ? { socialProviders: { google } } : {}),
    // Invite-only holds: disableSignUp means a password never creates a user. Passwords are set later, from Account (setPassword) or by reset link.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: RESET_TTL_S,
      // A mail failure is swallowed so a known address cannot be told apart from an unknown one by a 500.
      sendResetPassword: async ({ user, url }) => {
        try {
          await pickMailer(env.OTP_MAILER, env).send(user.email, url, "reset-password");
        } catch (error) {
          console.error(`reset mail failed: ${error instanceof Error ? error.message : "unknown"}`);
        }
      },
      onPasswordReset: async ({ user }, request) => {
        await recordPasswordChange(env, user, "password.reset", request ? requestMeta({ request }) : {});
      },
    },
    // Reset links are stored hashed, so a database read does not yield a usable link.
    verification: { storeIdentifier: { default: "plain", overrides: { "reset-password:": "hashed" } } },
    account: { accountLinking: { enabled: true, requireLocalEmailVerified: false } },
    advanced: {
      // Mail sends run after the response, so a known address costs the same time as an unknown one.
      backgroundTasks: { handler: (promise) => waitUntil(promise) },
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
        "/sign-in/email": { window: 600, max: 10 },
        "/request-password-reset": { window: 600, max: 5 },
        "/change-password": { window: 600, max: 5 },
        "/reset-password": { window: 600, max: 10 },
        "/email-otp/check-verification-otp": { window: 600, max: 5 },
      },
    },
    // Role writes from every path (set-role, update-user, seed) reach user.update.after. The request body says whether one was asked for.
    // The seed has no endpoint context, so it writes its own role.change row.
    databaseHooks: {
      // Both Google flows insert the account row here. A banned user gets none, and a platform admin gets none from the sign-in callback:
      // linking Google to an admin is only allowed through /link-social, whose OAuth state carries `link` (server-set, not client additionalData).
      // false aborts the insert; the after hook below turns the resulting redirect error into ADMIN_LINK_CODE.
      account: {
        create: {
          before: async (acct) => {
            if (acct.providerId === "credential") return;
            const [u] = await securityDb(env).select({ banned: user.banned, role: user.role }).from(user).where(eq(user.id, acct.userId));
            if (u?.banned) return false;
            const state = await getOAuthState().catch(() => null);
            if (refusesImplicitLink(u?.role, state?.link ? "link" : "sign-in")) {
              adminLinkRefused = true;
              return false;
            }
          },
        },
      },
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
    // The email-otp reset flow is not used: passwords reset through the core /request-password-reset. Blocked before the handler runs.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const resetMail =
          ctx.path === "/email-otp/request-password-reset" ||
          ctx.path === "/forget-password/email-otp" ||
          ctx.path === "/email-otp/reset-password" ||
          (ctx.path === "/email-otp/send-verification-otp" && ctx.body?.type === "forget-password");
        if (resetMail) throw new APIError("NOT_FOUND");
        // An idToken body signs in without the OAuth redirect and its audit; only the redirect flow is allowed.
        if ((ctx.path === "/sign-in/social" || ctx.path === "/link-social") && ctx.body?.idToken) throw new APIError("FORBIDDEN");
        if (ctx.path === "/email-otp/send-verification-otp") {
          const otpEmail = String(ctx.body?.email ?? "").trim().toLowerCase();
          if (otpEmail && !(await emailWithinCap(env, "otp-email", otpEmail))) throw new APIError("TOO_MANY_REQUESTS");
        }
        // Same per-address cap for password sign-in guesses and reset mail; unknown and known addresses count alike.
        if (ctx.path === "/sign-in/email" || ctx.path === "/request-password-reset") {
          const pwEmail = String(ctx.body?.email ?? "").trim().toLowerCase();
          if (pwEmail && !(await (ctx.path === "/sign-in/email" ? emailWithinCap(env, "pw-email", pwEmail, 10) : emailWithinCap(env, "reset-email", pwEmail))))
            throw new APIError("TOO_MANY_REQUESTS");
        }
        // The reset link always lands on our reset page, whatever the client asked for.
        if (ctx.path === "/request-password-reset" && ctx.body) ctx.body.redirectTo = "/reset-password";
        if (ctx.path === "/change-password") {
          const current = await getAuthoritativeSessionFromCtx(ctx);
          if (current && (current.session.impersonatedBy || !isFreshSession(current.session.createdAt)))
            throw new APIError("FORBIDDEN", { message: STALE_SESSION_MESSAGE });
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

        if (ctx.path === "/sign-in/email-otp" || ctx.path === "/sign-in/email") {
          const method = ctx.path === "/sign-in/email" ? { method: "password" } : {};
          if (isAPIError(result)) {
            const email = String(body.email ?? "").trim().toLowerCase();
            await writeAudit(env, { action: "sign_in.failure", target: maskEmails(email), data: { status: result.statusCode, ...method }, ...meta });
          } else {
            const signedIn = (result as { user: { id: string } }).user;
            await writeAudit(env, { action: "sign_in.success", actorUserId: signedIn.id, target: signedIn.id, data: method, ...meta });
          }
          return;
        }
        if (ctx.path.startsWith("/callback/")) {
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
          } else {
            const location = (result as { headers?: Headers } | null)?.headers?.get("location");
            const target = location ? new URL(location, "http://x") : null;
            if (target && adminLinkRefused) target.searchParams.set("error", ADMIN_LINK_CODE);
            const error = target?.searchParams.get("error")?.slice(0, 64) ?? null;
            await writeAudit(env, { action: "sign_in.failure", data: { provider: ctx.params?.id, error }, ...meta });
            if (target && adminLinkRefused) throw ctx.redirect(location!.startsWith("/") ? target.pathname + target.search : target.href);
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
            // N parallel creates can all pass this check. shortcut: parallel creates can exceed the cap, add an atomic counter if abuse appears
            if ((await countSelfServeCreatedBy(env, user.id)) >= SELF_SERVE_WORKSPACE_CAP)
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
              await ensureWorkspaceProfile(env, organization.id, { selfServe: user.role !== "admin", createdBy: user.id });
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
            await writeAudit(env, { action: "invite.create", actorUserId: inviter.id, workspaceId: organization.id, target: maskEmails(invitation.email), data: { role: invitation.role } });
          },
          afterAcceptInvitation: async ({ invitation, user, organization }) => {
            await writeAudit(env, { action: "invite.accept", actorUserId: user.id, workspaceId: organization.id, target: maskEmails(invitation.email) });
          },
          afterCancelInvitation: async ({ invitation, cancelledBy, organization }) => {
            await writeAudit(env, { action: "invite.cancel", actorUserId: cancelledBy.id, workspaceId: organization.id, target: maskEmails(invitation.email) });
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
