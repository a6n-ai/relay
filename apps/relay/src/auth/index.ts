import { createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth";
import { waitUntil } from "cloudflare:workers";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey as apiKeyPlugin } from "@better-auth/api-key";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";
import { organization } from "better-auth/plugins/organization";
import { securityDb } from "../db/security/client";
import {
  account,
  apiKey,
  invitation,
  member,
  session,
  team,
  teamMember,
  user,
  rateLimit,
  verification,
  workspace,
} from "../db/security/schema";
import type { Env } from "../env";
import { newId } from "../shared/ids";
import { googleConfig } from "./google";
import { auditAfterRequest, requestMeta, userAuditHooks } from "./hooks/audit";
import { accountCreateBefore } from "./hooks/oauth-link";
import { organizationHooks } from "./hooks/org";
import { guardRequest } from "./hooks/request-guards";
import { gateSuspendedWorkspace } from "./hooks/suspended";
import type { AdminLinkState } from "./hooks/types";
import { pickInviteMailer, pickMailer } from "./mailers";
import { recordPasswordChange } from "./password";
import { ac as platformAc, orgAc, orgRoles, roles as platformRoles } from "./permissions";
import { customRules } from "./rate-limit";

export { isFreshSession, needsFreshSignIn, recordPasswordChange, STALE_SESSION_MESSAGE } from "./password";

// better-auth asks for the organization model by plugin name or by our modelName, depending on the call.
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
const RESET_TTL_S = 3600;

export function createAuth(env: Env) {
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_SECRET and BETTER_AUTH_URL are required");
  }
  const google = googleConfig(env);
  // createAuth runs once per request, so this only ever describes the current callback.
  const linkState: AdminLinkState = { refused: false };

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    // Expired or replayed OAuth state and other API errors land on our sign-in page, not the default error page.
    onAPIError: { errorURL: "/sign-in" },
    database: drizzleAdapter(securityDb(env), {
      provider: "sqlite",
      schema: { user, session, account, verification, workspace, member, invitation, team, teamMember, rateLimit, apikey: apiKey },
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
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100, customRules },
    databaseHooks: {
      account: { create: { before: accountCreateBefore(env, linkState) } },
      user: userAuditHooks(env),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        await guardRequest(env, ctx);
        await gateSuspendedWorkspace(env, ctx);
      }),
      after: createAuthMiddleware((ctx) => auditAfterRequest(env, ctx, linkState)),
    },
    user: { additionalFields: { recoveryEmail: { type: "string", required: false, input: false } } },
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
        organizationHooks: organizationHooks(env),
        schema: {
          invitation: {
            additionalFields: {
              recoveryEmail: { type: "string", required: false, input: true },
              mailboxName: { type: "string", required: false, input: true },
              appId: { type: "string", required: false, input: true },
            },
          },
          organization: {
            modelName: "workspace",
            additionalFields: {
              // input: false keeps status server-set; a client cannot choose it on create.
              status: { type: "string", defaultValue: "active", required: false, input: false },
            },
          },
        },
      }),
    ],
  });
}
