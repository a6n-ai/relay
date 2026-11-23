import { env, SELF } from "cloudflare:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveApiKey } from "../src/core/api-keys";
import { guardInternal } from "../src/core/internal-guard";
import { seed } from "../src/core/seed";
import { securityDb } from "../src/db/security/client";
import { coreDb } from "../src/db/core/client";
import { sendingDomain } from "../src/db/core/schema";
import { apiKey, app, member, user, workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";

const db = securityDb(env);
const SEED_URL = "https://relay.test/api/internal/seed";

const input = {
  ownerEmails: ["a@example.com", "b@example.com"],
  workspace: { name: "a6n", slug: "a6n" },
  app: { name: "Relay", slug: "relay" },
};

beforeAll(async () => {
  await applyMigrations();
});

async function counts(emails: string[], slug: string) {
  const [ws] = await db.select().from(workspace).where(eq(workspace.slug, slug));
  return {
    users: (await db.select().from(user).where(inArray(user.email, emails))).length,
    workspaces: ws ? 1 : 0,
    owners: ws
      ? (await db.select().from(member).where(and(eq(member.organizationId, ws.id), eq(member.role, "owner")))).length
      : 0,
    apps: ws ? (await db.select().from(app).where(eq(app.workspaceId, ws.id))).length : 0,
  };
}

describe("seed", () => {
  it("creates the users, workspace, owner members and app, and returns a usable api key", async () => {
    const result = await seed(env, input);

    expect(await counts(input.ownerEmails, "a6n")).toEqual({ users: 2, workspaces: 1, owners: 2, apps: 1 });
    expect(result.apiKey).toMatch(/^rk_/);
    expect(await resolveApiKey(env, result.apiKey)).toEqual({
      workspaceId: result.workspaceId,
      appId: result.appId,
      keyId: expect.any(String),
    });
    const [owner] = await db.select().from(user).where(eq(user.email, "a@example.com"));
    expect(owner.role).toBe("admin");
  });

  it("is idempotent: a rerun keeps the counts, the ids, and returns no api key", async () => {
    const first = await seed(env, input);
    const again = await seed(env, input);

    expect(again).toEqual({ workspaceId: first.workspaceId, appId: first.appId, apiKey: "" });
    expect(await counts(input.ownerEmails, "a6n")).toEqual({ users: 2, workspaces: 1, owners: 2, apps: 1 });
  });

  it("adds a missing owner member for an existing user, matching the email case-insensitively", async () => {
    await db.insert(user).values({ id: "usr_seedexist001", name: "c", email: "c@example.com", role: "user" });

    const result = await seed(env, {
      ...input,
      ownerEmails: ["  C@Example.com "],
      workspace: { name: "Second", slug: "second" },
      app: { name: "Relay", slug: "relay" },
    });

    const users = await db.select().from(user).where(eq(user.email, "c@example.com"));
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe("admin");
    const owners = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, result.workspaceId), eq(member.userId, "usr_seedexist001")));
    expect(owners).toHaveLength(1);
    expect(owners[0].role).toBe("owner");
  });

  it("issues a missing api key on rerun, then returns no key once one is live", async () => {
    const keyInput = { ...input, workspace: { name: "Keyless", slug: "keyless" } };
    const first = await seed(env, keyInput);
    const forApp = (appId: string) => sql`json_extract(${apiKey.metadata}, '$.appId') = ${appId}`;
    await db.delete(apiKey).where(forApp(first.appId));

    const repaired = await seed(env, keyInput);
    expect(repaired.apiKey).toMatch(/^rk_/);
    const live = await db
      .select()
      .from(apiKey)
      .where(and(forApp(first.appId), eq(apiKey.enabled, true)));
    expect(live).toHaveLength(1);

    expect((await seed(env, keyInput)).apiKey).toBe("");
  });

  it("creates the sending domain once and refuses a domain owned by another workspace", async () => {
    const domainInput = { ...input, workspace: { name: "Dom", slug: "dom" }, domain: { domain: "Mail.Dom.test", sesRegion: "ca-central-1" } };
    const first = await seed(env, domainInput);
    await seed(env, domainInput);

    const domains = await coreDb(env).select().from(sendingDomain).where(eq(sendingDomain.domain, "mail.dom.test"));
    expect(domains).toHaveLength(1);
    expect(domains[0].workspaceId).toBe(first.workspaceId);

    await expect(
      seed(env, { ...domainInput, workspace: { name: "Other", slug: "other" } }),
    ).rejects.toThrow("domain belongs to another workspace");
  });
});

describe("POST /api/internal/seed", () => {
  it("returns 404 when SEED_SECRET is unset, before checking the bearer", async () => {
    const denied = guardInternal(new Request(SEED_URL, { method: "POST" }), undefined);
    expect(denied?.status).toBe(404);
  });

  it("returns 401 for a wrong secret and writes nothing", async () => {
    const res = await SELF.fetch(SEED_URL, {
      method: "POST",
      headers: { authorization: "Bearer wrong", "content-type": "application/json" },
      body: JSON.stringify({ ...input, workspace: { name: "Route", slug: "route" } }),
    });
    expect(res.status).toBe(401);
    expect(await counts(input.ownerEmails, "route")).toEqual({ users: 2, workspaces: 0, owners: 0, apps: 0 });
  });

  it("returns 200 with the seed result for the right secret, and 400 for an invalid body", async () => {
    const headers = { authorization: `Bearer ${env.SEED_SECRET}`, "content-type": "application/json" };
    const bad = await SELF.fetch(SEED_URL, { method: "POST", headers, body: "{}" });
    expect(bad.status).toBe(400);

    const res = await SELF.fetch(SEED_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...input, workspace: { name: "Route", slug: "route" } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workspaceId: string; appId: string; apiKey: string };
    expect(body.workspaceId).toMatch(/^wsp_/);
    expect(body.appId).toMatch(/^app_/);
    expect(body.apiKey).toMatch(/^rk_/);
  });
});
