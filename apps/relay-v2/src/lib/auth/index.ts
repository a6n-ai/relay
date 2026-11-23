import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { organization } from "better-auth/plugins/organization";
import { centralDb } from "../../db/central/client";
import {
  account,
  invitation,
  member,
  session,
  team,
  teamMember,
  user,
  verification,
  workspace,
} from "../../db/central/schema";
import type { Env } from "../../env";
import { newId } from "../ids";
import { ORG_DISABLED_PATHS } from "./disabled-paths";
import { type OtpMailer, consoleOtpMailer, memoryOtpMailer } from "./otp-mailer";
import { orgAc, orgRoles } from "./permissions";

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
    disabledPaths: [...ORG_DISABLED_PATHS],
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
      },
    }),
    advanced: {
      useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
      database: {
        generateId: ({ model }) => newId(ID_PREFIX[model] ?? model),
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "user", input: false },
      },
    },
    session: {
      expiresIn: 30 * DAY_S,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    plugins: [
      emailOTP({
        disableSignUp: true,
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
