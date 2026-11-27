import { env, runInDurableObject } from "cloudflare:test";
import { NonRetryableError } from "cloudflare:workflows";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchAudiencePage, parseAudiencePage, verifyAudienceRequest, type HookCall } from "../src/core/audience-hook";
import { signBody } from "../src/core/webhook-crypto";
import type { Env } from "../src/env";
import { applyMigrations, seedVerifiedSender } from "./migrate";
import { securityDb } from "../src/db/security/client";
import { workspace } from "../src/db/security/schema";

beforeAll(async () => {
  await applyMigrations();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const recipient = (email: string, extra: Record<string, unknown> = {}) => ({
  email,
  consent: "express",
  consentAt: 1_700_000_000_000,
  ...extra,
});
const httpsCall = (): Extract<HookCall, { kind: "https" }> => ({
  kind: "https",
  url: "https://hooks.example.com/audience",
  body: "{}",
  headers: { "content-type": "application/json" },
});
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("parseAudiencePage", () => {
  it("round-trips a valid page", () => {
    const page = { recipients: [recipient("A@x.com", { firstName: "Ana", data: { plan: "pro" } })], nextCursor: "a" };
    expect(parseAudiencePage(page)).toEqual({
      recipients: [{ email: "a@x.com", firstName: "Ana", consent: "express", consentAt: 1_700_000_000_000, data: { plan: "pro" } }],
      nextCursor: "a",
      invalid: 0,
    });
  });

  it("counts bad recipients as invalid and keeps the good ones", () => {
    const page = parseAudiencePage({
      recipients: [
        recipient("ok@x.com"),
        recipient("maybe@x.com", { consent: "maybe" }),
        recipient("badkey@x.com", { data: { "Bad-Key": "1" } }),
        recipient("manykeys@x.com", { data: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, "1"])) }),
        recipient("not-an-email"),
      ],
      nextCursor: null,
    });
    expect(page).toMatchObject({ invalid: 4, nextCursor: null });
    expect(page?.recipients.map((r) => r.email)).toEqual(["ok@x.com"]);
  });

  it("skips a recipient whose consentAt is more than 5 minutes ahead", () => {
    const page = parseAudiencePage({
      recipients: [recipient("ok@x.com"), recipient("future@x.com", { consentAt: Date.now() + 10 * 60_000 })],
      nextCursor: null,
    });
    expect(page).toMatchObject({ invalid: 1 });
    expect(page?.recipients.map((r) => r.email)).toEqual(["ok@x.com"]);
  });

  it("returns null for more than 500 recipients or a bad shape", () => {
    const many = Array.from({ length: 501 }, (_, i) => recipient(`u${i}@x.com`));
    expect(parseAudiencePage({ recipients: many, nextCursor: null })).toBeNull();
    expect(parseAudiencePage({ recipients: [] })).toBeNull();
    expect(parseAudiencePage("nope")).toBeNull();
  });
});

describe("fetchAudiencePage", () => {
  it("does not follow a redirect and fails the step without retry", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }));
    const call = httpsCall();
    await expect(fetchAudiencePage(env, call)).rejects.toBeInstanceOf(NonRetryableError);
    expect(spy).toHaveBeenCalledWith(call.url, expect.objectContaining({ redirect: "manual" }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each([503, 429])("retries a %i", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("slow down", { status }));
    const err = await fetchAudiencePage(env, httpsCall()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NonRetryableError);
  });

  it("fails a body over the cap without retry", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x".repeat(2_000_000), { status: 200 }));
    await expect(fetchAudiencePage(env, httpsCall())).rejects.toBeInstanceOf(NonRetryableError);
  });

  it("parses a valid page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ recipients: [recipient("a@x.com")], nextCursor: "b" }));
    await expect(fetchAudiencePage(env, httpsCall())).resolves.toMatchObject({ recipients: [{ email: "a@x.com" }], nextCursor: "b" });
  });

  it("passes the binding request to the bound Worker", async () => {
    const resolveAudience = vi.fn().mockResolvedValue({ recipients: [], nextCursor: null });
    const request = { type: "audience.page" as const, appId: "app_1", workspaceId: "ws_1", campaignId: "cmp_1", audience: null, cursor: null, limit: 500, sentAt: 1 };
    const bound = { ...env, TIFFIN_AUDIENCE: { resolveAudience } } as unknown as Env;
    await expect(fetchAudiencePage(bound, { kind: "binding", binding: "TIFFIN_AUDIENCE", request })).resolves.toMatchObject({ nextCursor: null });
    expect(resolveAudience).toHaveBeenCalledWith(request);
  });
});

describe("verifyAudienceRequest", () => {
  const secret = "s".repeat(32);
  const signed = async (sentAt: number) => {
    const body = JSON.stringify({ type: "audience.page", workspaceId: "ws_1", sentAt });
    const headers = new Headers({ "x-relay-signature": `sha256=${await signBody(secret, body)}`, "x-relay-timestamp": String(sentAt) });
    return { body, headers };
  };

  it("passes a fresh request and rejects a changed sentAt", async () => {
    const now = Date.now();
    const { body, headers } = await signed(now);
    expect(await verifyAudienceRequest(secret, body, headers, now)).toBe(true);
    expect(await verifyAudienceRequest(secret, body.replace(String(now), String(now + 1000)), headers, now)).toBe(false);
  });

  it("rejects a 6-minute-old request", async () => {
    const now = Date.now();
    const { body, headers } = await signed(now - 6 * 60_000);
    expect(await verifyAudienceRequest(secret, body, headers, now)).toBe(false);
  });

  it("rejects a sentAt more than 60 s in the future", async () => {
    const now = Date.now();
    const { body, headers } = await signed(now + 61_000);
    expect(await verifyAudienceRequest(secret, body, headers, now)).toBe(false);
  });
});

describe("ClientDO audience hook", () => {
  const stubFor = (ws: string) => env.CLIENT.get(env.CLIENT.idFromName(ws));

  it("refuses an unknown binding", async () => {
    const ws = "ws_hook_binding";
    const stub = stubFor(ws);
    const err = await stub.setAudienceHook(ws, "app_1", { kind: "binding", binding: "MAIL" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("unknown binding");
  });

  it("returns the secret once, keeps it on a later save, and signs the request", async () => {
    const ws = "ws_hook_sign";
    await securityDb(env).insert(workspace).values({ id: ws, name: ws, slug: ws });
    await seedVerifiedSender(ws);
    const stub = stubFor(ws);
    const { secret } = await stub.setAudienceHook(ws, "app_1", { kind: "https", url: "https://hooks.example.com/a" });
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(await stub.setAudienceHook(ws, "app_1", { kind: "https", url: "https://hooks.example.com/b" })).toEqual({ secret: null });
    expect(await stub.getAudienceHook(ws, "app_1")).toEqual({ kind: "https", url: "https://hooks.example.com/b", binding: null, enabled: true });

    const campaign = (await stub.createCampaign(ws, "app_1", "Hooked")) as { id: string };
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE campaign SET status = 'sending', run_seq = 1 WHERE id = ?", campaign.id);
    });
    expect(await stub.audienceCall(ws, campaign.id, 2)).toBe("stale");
    const call = await stub.audienceCall(ws, campaign.id, 1);
    if (typeof call === "string" || call.kind !== "https") throw new Error("expected an https call");
    expect(call.url).toBe("https://hooks.example.com/b");
    expect(call.headers["x-relay-signature"]).toBe(`sha256=${await signBody(secret!, call.body)}`);
    expect(JSON.parse(call.body)).toMatchObject({ type: "audience.page", appId: "app_1", workspaceId: ws, campaignId: campaign.id, cursor: null, limit: 500 });
    expect(call.headers["x-relay-timestamp"]).toBe(String(JSON.parse(call.body).sentAt));
    expect(await verifyAudienceRequest(secret!, call.body, new Headers(call.headers), Date.now())).toBe(true);
  });
});
