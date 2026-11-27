import { env, runInDurableObject, SELF } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { brandDomain } from "../src/core/campaigns";
import { readUnsubscribeToken, unsubscribeToken } from "../src/core/unsubscribe";
import { coreDb } from "../src/db/core/client";
import { address, sendingDomain } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { workspace } from "../src/db/security/schema";
import { applyMigrations, seedVerifiedSender } from "./migrate";

const SECRET = env.UNSUBSCRIBE_SECRET;
const stubFor = (ws: string) => env.CLIENT.get(env.CLIENT.idFromName(ws));
const marketing = {
  appId: "app_1",
  stream: "marketing" as const,
  from: "relay@a6n.ai",
  to: "a@x.com",
  subject: "News",
  html: "<p>Hi</p>",
  text: "Hi",
};
const POST = { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" };

let enqueue: MockInstance<typeof env.SEND.send>;

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(() => {
  enqueue = vi.spyOn(env.SEND, "send").mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function seed(ws: string) {
  await securityDb(env).insert(workspace).values({ id: ws, name: ws, slug: ws });
  await seedVerifiedSender(ws);
  await coreDb(env)
    .insert(sendingDomain)
    .values({ workspaceId: ws, domain: "b.test", sesRegion: "ap-south-1", status: "verified" })
    .onConflictDoUpdate({ target: sendingDomain.domain, set: { workspaceId: ws, status: "verified" } });
  await coreDb(env)
    .insert(address)
    .values({ workspaceId: ws, appId: "app_1", email: "relay@b.test", kind: "sender", canSend: true })
    .onConflictDoUpdate({ target: address.email, set: { workspaceId: ws, canSend: true } });
  return stubFor(ws);
}

function sql<T>(ws: string, query: string, ...bind: unknown[]) {
  return runInDurableObject(stubFor(ws), (_i, state) => state.storage.sql.exec(query, ...bind).toArray() as T[]);
}

const url = (token: string) => `https://relay.test/u/${token}`;

describe("unsubscribe tokens", () => {
  it("round-trips a token and rejects tampered, foreign, malformed or unkeyed ones", async () => {
    const token = await unsubscribeToken(SECRET, "wsp_a", "msg_1");
    expect(await readUnsubscribeToken(SECRET, token)).toEqual({ workspaceId: "wsp_a", messageId: "msg_1" });
    const [ws, msg, sig] = token.split(".") as [string, string, string];
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    for (const bad of [
      `${ws}.${msg}.${flipped}`,
      `wsp_b.${msg}.${sig}`,
      `${ws}.${msg}`,
      `${ws}.1_msg.${sig}`,
    ]) {
      expect(await readUnsubscribeToken(SECRET, bad)).toBeNull();
    }
    expect(await readUnsubscribeToken(undefined, token)).toBeNull();
  });
});

describe("brand opt-out key", () => {
  it("is the registrable domain, so subdomains share it and sibling brands do not", () => {
    expect(brandDomain("news@news.brand.com")).toBe("brand.com");
    expect(brandDomain("shop@shop.brand.co.uk")).toBe(brandDomain("hi@brand.co.uk"));
    expect(brandDomain("x@brand-a.com")).not.toBe(brandDomain("x@brand-b.com"));
    expect(brandDomain("x@localhost")).toBe("localhost");
  });
});

describe("unsubscribe endpoint", () => {
  it("GET shows one confirm button and writes nothing", async () => {
    const ws = "wsp_unsub_get";
    const stub = await seed(ws);
    const { messageId } = await stub.send(ws, marketing);
    const res = await SELF.fetch(url(await unsubscribeToken(SECRET, ws, messageId)));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.match(/<form method="post"/g)).toHaveLength(1);
    expect(html).toContain("Unsubscribe from these emails?");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await sql(ws, "SELECT COUNT(*) AS n FROM marketing_optout")).toEqual([{ n: 0 }]);
  });

  it("one-click POST from a subdomain opts out of its whole brand, transactional still sends", async () => {
    const ws = "wsp_unsub_brand";
    const stub = await seed(ws);
    for (const domain of ["news.brand.com", "offers.brand.com"]) {
      await coreDb(env).insert(sendingDomain).values({ workspaceId: ws, domain, sesRegion: "ap-south-1", status: "verified" });
      await coreDb(env).insert(address).values({ workspaceId: ws, appId: "app_1", email: `relay@${domain}`, kind: "sender", canSend: true });
    }
    const { messageId } = await stub.send(ws, { ...marketing, from: "relay@news.brand.com" });
    expect((await SELF.fetch(url(await unsubscribeToken(SECRET, ws, messageId)), POST)).status).toBe(200);
    expect(await sql(ws, "SELECT domain FROM marketing_optout")).toEqual([{ domain: "brand.com" }]);
    expect((await stub.send(ws, { ...marketing, from: "relay@offers.brand.com" })).status).toBe("suppressed");
    expect((await stub.send(ws, { ...marketing, from: "relay@offers.brand.com", stream: "transactional" })).status).toBe("queued");
  });

  it("one-click POST opts out of marketing from the sending domain only", async () => {
    const ws = "wsp_unsub_post";
    const stub = await seed(ws);
    const campaign = ((await stub.createCampaign(ws, "app_1", "C")) as { id: string });
    const first = await stub.send(ws, { ...marketing, campaignId: campaign.id });
    const path = url(await unsubscribeToken(SECRET, ws, first.messageId));

    expect((await SELF.fetch(path, POST)).status).toBe(200);
    const again = await SELF.fetch(path, POST);
    expect(again.status).toBe(200);
    expect(await again.text()).toContain("You are unsubscribed.");

    expect(await sql(ws, "SELECT email, domain FROM marketing_optout")).toEqual([{ email: "a@x.com", domain: "a6n.ai" }]);
    expect(await sql(ws, "SELECT COUNT(*) AS n FROM suppression")).toEqual([{ n: 0 }]);
    expect(await sql(ws, "SELECT unsubscribed_at IS NOT NULL AS done FROM message WHERE id = ?", first.messageId)).toEqual([{ done: 1 }]);
    expect(await sql(ws, "SELECT unsubscribed AS n FROM campaign WHERE id = ?", campaign.id)).toEqual([{ n: 1 }]);

    expect((await stub.send(ws, marketing)).status).toBe("suppressed");
    expect((await stub.send(ws, { ...marketing, from: "relay@b.test" })).status).toBe("queued");
    expect((await stub.send(ws, { ...marketing, stream: "transactional" })).status).toBe("queued");
  });

  it("answers a forged token with 400 and never calls the DO", async () => {
    const spy = vi.spyOn(env.CLIENT, "get");
    const forged = await SELF.fetch(url("wsp_x.msg_y.AAAA"), { method: "POST" });
    const garbage = await SELF.fetch(url("garbage"), { method: "POST" });
    expect(forged.status).toBe(400);
    expect(await forged.text()).toBe(await garbage.text());
    expect(spy).not.toHaveBeenCalled();
    expect((await SELF.fetch(url("wsp_x.msg_y.AAAA"))).status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});
