import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin, emailOTP } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import { authAuditAction } from "@foundry/auth";
import { Role } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { account, session, users, verification } from "@/db/schema";
import { recordAudit } from "@/lib/services/session-service";
import { betterAuthPassword } from "./password";
import { ac, roles } from "./permissions";
import { notifyNewLoginIfNewDevice, notifyPasswordChanged, sendAuthOtp } from "./security-events";

const log = createLogger("auth");
const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, account, session, verification },
  }),
  advanced: {
    database: { generateId: false },
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
  },
  session: { expiresIn: SESSION_MAX_AGE_S, freshAge: 60 * 60 },
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
      role: { type: "string", required: false, defaultValue: Role.ADMIN, input: false },
      publicId: { type: "string", required: false, input: false },
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
    adminPlugin({ ac, roles, defaultRole: Role.ADMIN, adminRoles: [Role.ADMIN] }),
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
