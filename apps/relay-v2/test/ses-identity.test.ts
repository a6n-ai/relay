import { describe, expect, it, vi } from "vitest";
import { sesIdentityApi } from "../src/core/ses-identity";
import type { Env } from "../src/env";

const credsEnv = { AWS_ACCESS_KEY_ID: "AKIDTEST", AWS_SECRET_ACCESS_KEY: "secret" } as Partial<Env> as Env;
const json = (status: number, body: unknown) =>
  vi.fn(async (_req: Request) => new Response(JSON.stringify(body), { status }));

describe("sesIdentityApi over SES v2", () => {
  it("creates an identity with a POST and reports an existing one as alreadyExists", async () => {
    const created = json(200, {});
    await expect(sesIdentityApi(credsEnv, created as unknown as typeof fetch).create("us-east-1", "new.test")).resolves.toEqual({
      alreadyExists: false,
    });
    const req = created.mock.calls[0][0];
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://email.us-east-1.amazonaws.com/v2/email/identities");
    expect(await req.clone().json()).toEqual({ EmailIdentity: "new.test" });

    const exists = json(400, { __type: "AlreadyExistsException", message: "exists" });
    await expect(sesIdentityApi(credsEnv, exists as unknown as typeof fetch).create("us-east-1", "new.test")).resolves.toEqual({
      alreadyExists: true,
    });
  });

  it("maps a GET to the identity's verification and DKIM state, and a 404 to null", async () => {
    const found = json(200, {
      VerifiedForSendingStatus: true,
      DkimAttributes: { Status: "SUCCESS", Tokens: ["t1", "t2", "t3"] },
    });
    await expect(sesIdentityApi(credsEnv, found as unknown as typeof fetch).get("ap-south-1", "seen.test")).resolves.toEqual({
      verified: true,
      dkimStatus: "SUCCESS",
      dkimTokens: ["t1", "t2", "t3"],
    });
    const req = found.mock.calls[0][0];
    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://email.ap-south-1.amazonaws.com/v2/email/identities/seen.test");

    const missing = json(404, { __type: "NotFoundException", message: "nope" });
    await expect(sesIdentityApi(credsEnv, missing as unknown as typeof fetch).get("ap-south-1", "gone.test")).resolves.toBeNull();
  });
});
