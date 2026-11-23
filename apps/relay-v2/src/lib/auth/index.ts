import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";
import { organization } from "better-auth/plugins/organization";
import { eq } from "drizzle-orm";
import { centralDb } from "../../db/central/client";
import {
  account,
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
} from "../../db/central/schema";
import type { Env } from "../../env";
import { newId } from "../ids";
import { pickInviteMailer } from "./invite-mailer";
import { type OtpMailer, consoleOtpMailer, memoryOtpMailer } from "./otp-mailer";
import { ac as platformAc, orgAc, orgRoles, roles as platformRoles } from "./permissions";

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
};

const DAY_S = 24 * 60 * 60;

export function pickMailer(kind: Env["OTP_MAILER"]): OtpMailer {
  if (kind === "memory") return memoryOtpMailer;
  if (kind === "console") return consoleOtpMailer;
  throw new Error("no OTP mailer configured");
}

export function createAuth(env: Env) {
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_SECRET and BETTER_AUTH_URL are required");
  }
  // input: false keeps quota, status and region server-set; a client cannot choose them on create.
  const serverOnly = { input: false } as const;

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(centralDb(env), {
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
        "/email-otp/send-verification-otp": { window: 600, max: 5 },
        "/sign-in/email-otp": { window: 600, max: 5 },
      },
    },
    session: {
      expiresIn: 30 * DAY_S,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    plugins: [
      admin({ ac: platformAc, roles: platformRoles }),
      emailOTP({
        disableSignUp: true,
        storeOTP: "hashed",
        allowedAttempts: 5,
        expiresIn: 600,
        sendVerificationOTP: async ({ email, otp, type }) => {
          await pickMailer(env.OTP_MAILER).send(email, otp, type);
        },
      }),
      organization({
        // Workspaces are created by platform admins only; the creator becomes owner.
        allowUserToCreateOrganization: async (user) => user.role === "admin",
        ac: orgAc,
        roles: orgRoles,
        teams: { enabled: true, defaultTeam: { enabled: false }, allowRemovingAllTeams: true },
        sendInvitationEmail: async ({ id, email, role }) => {
          await pickInviteMailer(env.INVITE_MAILER).send(email, { id, role });
        },
        organizationHooks: {
          beforeDeleteOrganization: async ({ organization }) => {
            const [hit] = await centralDb(env)
              .select({ id: app.id })
              .from(app)
              .where(eq(app.workspaceId, organization.id))
              .limit(1);
            if (hit) throw new APIError("BAD_REQUEST", { message: "workspace still has apps" });
          },
        },
        schema: {
          organization: {
            modelName: "workspace",
            additionalFields: {
              mailingCountry: { type: "string", defaultValue: "CA", required: false, ...serverOnly },
              physicalAddress: { type: "string", required: false, ...serverOnly },
              monthlyMessageQuota: { type: "number", defaultValue: 10000, required: false, ...serverOnly },
              status: { type: "string", defaultValue: "active", required: false, ...serverOnly },
              defaultSesRegion: { type: "string", defaultValue: "ap-south-1", required: false, ...serverOnly },
            },
          },
        },
      }),
    ],
  });
}
