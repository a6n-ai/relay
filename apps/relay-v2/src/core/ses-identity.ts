import { AwsError, encodePathSegment } from "@foundry/cloud";
import type { Env } from "../env";
import { sesClient } from "./ses";

export type SesIdentity = {
  verified: boolean;
  dkimStatus: "PENDING" | "SUCCESS" | "FAILED" | "TEMPORARY_FAILURE" | "NOT_STARTED";
  dkimTokens: string[];
};

export type SesIdentityApi = {
  create(region: string, domain: string): Promise<{ alreadyExists: boolean }>;
  get(region: string, domain: string): Promise<SesIdentity | null>;
};

type SesIdentityResponse = {
  VerifiedForSendingStatus?: boolean;
  DkimAttributes?: { Status?: SesIdentity["dkimStatus"]; Tokens?: string[] };
};

const CALL = { retries: 0, timeoutMs: 10_000 };

export function sesIdentityApi(env: Env, fetchImpl?: typeof fetch): SesIdentityApi {
  if (env.SES_TRANSPORT === "memory") return memorySesIdentity;
  const base = (region: string) => `https://email.${region}.amazonaws.com/v2/email/identities`;
  return {
    async create(region, domain) {
      try {
        await sesClient(region, env, fetchImpl).json(base(region), { json: { EmailIdentity: domain }, ...CALL });
        return { alreadyExists: false };
      } catch (err) {
        if (err instanceof AwsError && err.code === "AlreadyExistsException") return { alreadyExists: true };
        throw err;
      }
    },
    async get(region, domain) {
      try {
        const res = await sesClient(region, env, fetchImpl).json<SesIdentityResponse>(
          `${base(region)}/${encodePathSegment(domain)}`,
          CALL,
        );
        return {
          verified: res.VerifiedForSendingStatus === true,
          dkimStatus: res.DkimAttributes?.Status ?? "NOT_STARTED",
          dkimTokens: res.DkimAttributes?.Tokens ?? [],
        };
      } catch (err) {
        if (err instanceof AwsError && err.status === 404) return null;
        throw err;
      }
    },
  };
}

const memoryIdentities = new Map<string, SesIdentity>();

// Tests preset an identity to stand in for one already in the shared SES account or verified by DNS.
export const memorySesIdentity: SesIdentityApi & { preset(domain: string, identity: SesIdentity): void } = {
  async create(_region, domain) {
    if (memoryIdentities.has(domain)) return { alreadyExists: true };
    memoryIdentities.set(domain, { verified: false, dkimStatus: "PENDING", dkimTokens: ["tok1", "tok2", "tok3"] });
    return { alreadyExists: false };
  },
  async get(_region, domain) {
    return memoryIdentities.get(domain) ?? null;
  },
  preset(domain, identity) {
    memoryIdentities.set(domain, identity);
  },
};
