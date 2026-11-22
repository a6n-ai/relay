import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin, emailOTP, organization } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { and, count, eq, like } from "drizzle-orm";
import { authAuditAction } from "@foundry/auth";
import { Role } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import {
  account,
  invitation,
  member,
  organization as organizationTable,
  session,
  team,
  teamMember,
  users,
  verification,
} from "@/db/schema";
import { recordAudit } from "@/lib/services/session-service";
import { betterAuthPassword } from "./password";
import { ADMIN_DISABLED_PATHS, ORG_DISABLED_PATHS } from "./disabled-paths";
import { INVITE_LIFETIME_S } from "./invites";
import { applySelfServeLimits, canCreateSelfServeWorkspace } from "./workspace-limits";
import { ac, orgAc, orgRoles, roles } from "./permissions";
import { notifyNewLoginIfNewDevice, notifyPasswordChanged, sendAuthOtp } from "./security-events";

const log = createLogger("auth");
const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      account,
      session,
      verification,
      organization: organizationTable,
      member,
      invitation,
      team,
      teamMember,
    },
  }),
  disabledPaths: [...ORG_DISABLED_PATHS, ...ADMIN_DISABLED_PATHS],
  advanced: {
    database: { generateId: false },
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
  },
  // cookieCache skips the session query on most page views (the DB is a region away from
  // visitors); a revoked session stays valid for at most those 5 minutes. Same as xplorers.
  session: {
    expiresIn: SESSION_MAX_AGE_S,
    freshAge: 60 * 60,
    cookieCache: { enabled: true, strategy: "compact", maxAge: 5 * 60 },
  },
  emailAndPassword: {
    enabled: true,
    password: betterAuthPassword,
    minPasswordLength: 12,
    maxPasswordLength: 256,
    disableSignUp: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: async ({ user }) => {
      try {
        await db.update(users).set({ passwordSet: true }).where(eq(users.id, BigInt(user.id)));
      } catch (e) {
        log.error({ err: e }, "passwordSet flip after reset failed");
      }
    },
  },
  user: {
    fields: { createdAt: "bauthCreatedAt", updatedAt: "bauthUpdatedAt" },
    additionalFields: {
      role: { type: "string", required: false, defaultValue: Role.USER, input: false },
      publicId: { type: "string", required: false, input: false },
      // Platform-wide override (e.g. "super_admin"), separate from member.role.
      // See @foundry/auth resolveVisibleOrgIds — not settable via client input.
      platformRole: { type: "string", required: false, defaultValue: null, input: false },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: "hashed",
      disableSignUp: true,
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendAuthOtp(email, otp, type);
      },
    }),
    organization({
      // Any signed-in user may create a workspace; self-made ones start limited (see selfServeLimits).
      // Public sign-up stays disabled above. Flat workspaces, no Foundry brand→franchise hierarchy.
      allowUserToCreateOrganization: true,
      // Limits are not client fields: the create body strips unknown keys, so they are set server-side after insert.
      organizationHooks: {
        beforeCreateOrganization: async ({ user }) => {
          const platformRole = user.platformRole ?? null;
          if (platformRole === "super_admin") return;
          const [owned] = await db
            .select({ n: count() })
            .from(member)
            .innerJoin(organizationTable, eq(organizationTable.id, member.organizationId))
            .where(
              and(
                eq(member.userId, BigInt(user.id)),
                like(member.role, "%owner%"),
                eq(organizationTable.selfServe, true),
              ),
            );
          if (!canCreateSelfServeWorkspace(platformRole, Number(owned?.n ?? 0))) {
            throw new APIError("FORBIDDEN", { message: "You can create up to 3 workspaces" });
          }
        },
        afterCreateOrganization: async ({ organization: org, user }) => {
          await applySelfServeLimits(org.id, user.platformRole ?? null);
        },
      },
      ac: orgAc,
      roles: orgRoles,
      // Relay teams are explicit: no implicit default team per workspace, and a workspace may delete its last team.
      teams: { enabled: true, defaultTeam: { enabled: false }, allowRemovingAllTeams: true },
      invitationExpiresIn: INVITE_LIFETIME_S,
      // Re-invite replaces the pending invite, so new roles take effect (resend keeps old roles).
      cancelPendingInvitationsOnReInvite: true,
    }),
    adminPlugin({ ac, roles, defaultRole: Role.USER, adminRoles: [Role.ADMIN] }),
    nextCookies(),
  ],
  databaseHooks: {
    session: {
      create: {
        before: async (sess) => {
          const [u] = await db
            .select({ status: users.status, emailVerified: users.emailVerified })
            .from(users)
            .where(eq(users.id, BigInt(sess.userId as string)))
            .limit(1);
          if (u && u.status !== "active") {
            throw new APIError("FORBIDDEN", { message: "This account is not active." });
          }
          if (u && !u.emailVerified) {
            throw new APIError("FORBIDDEN", {
              message: "Verify your email address first — check your inbox for the code.",
            });
          }
        },
      },
      delete: {
        after: async (sess) => {
          try {
            const [user] = await db
              .select({ publicId: users.publicId })
              .from(users)
              .where(eq(users.id, BigInt(sess.userId as string)))
              .limit(1);
            await recordAudit({
              entity: "auth",
              entityPublicId: user?.publicId ?? sess.userId,
              operation: "logout",
              changes: null,
              createdBy: null,
            });
          } catch (e) {
            log.error({ err: e }, "audit logout hook failed");
          }
        },
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const failed = ctx.context.returned instanceof APIError;
      const auditAction = authAuditAction(ctx.path);
      if (auditAction && !failed) {
        try {
          const body = ctx.body as { email?: string } | undefined;
          const sessionUser = (
            ctx.context as { session?: { user?: { email?: string; publicId?: string } } }
          ).session?.user;
          await recordAudit({
            entity: "auth",
            entityPublicId: sessionUser?.publicId ?? body?.email ?? sessionUser?.email ?? "unknown",
            operation: "update",
            changes: { _action: auditAction },
            createdBy: null,
          });
        } catch (e) {
          log.error({ err: e, action: auditAction }, "auth audit hook failed");
        }
      }

      if (ctx.path === "/email-otp/reset-password" || ctx.path === "/change-password") {
        if (failed) return;
        try {
          const body = ctx.body as { email?: string } | undefined;
          const sessionEmail = (ctx.context as { session?: { user?: { email?: string } } }).session?.user?.email;
          await notifyPasswordChanged(body?.email ?? sessionEmail ?? null);
        } catch (e) {
          log.error({ err: e }, "password-changed email hook failed");
        }
        return;
      }

      if (ctx.path !== "/sign-in/email" && ctx.path !== "/sign-in/email-otp") return;

      const method = ctx.path === "/sign-in/email-otp" ? "email-otp" : "email";
      const newSession = ctx.context.newSession;

      if (newSession) {
        try {
          const publicId = (newSession.user as Record<string, unknown>).publicId as string | undefined;
          await recordAudit({
            entity: "auth",
            entityPublicId: publicId ?? newSession.user.id,
            operation: "login",
            changes: { method },
            createdBy: null,
          });
        } catch (e) {
          log.error({ err: e }, "audit login hook failed");
        }
        try {
          const s = newSession.session as { userId: string; ipAddress?: string | null; userAgent?: string | null };
          await notifyNewLoginIfNewDevice({
            userId: String(s.userId),
            email: newSession.user.email,
            ip: s.ipAddress,
            userAgent: s.userAgent,
          });
        } catch (e) {
          log.error({ err: e }, "new-login email hook failed");
        }
        return;
      }

      if (failed) {
        try {
          const body = ctx.body as { email?: string } | undefined;
          await recordAudit({
            entity: "auth",
            entityPublicId: body?.email ?? "unknown",
            operation: "login_failed",
            changes: { method },
            createdBy: null,
          });
        } catch (e) {
          log.error({ err: e }, "audit login_failed hook failed");
        }
      }
    }),
  },
});
