import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiKey } from "../src/core/api-keys";
import { securityDb } from "../src/db/security/client";
import { app, member, user, workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";

const limit = vi.hoisted(() => ({ allow: true }));
vi.mock("../src/core/api-keys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/core/api-keys")>()),
  withinRateLimit: async () => limit.allow,
}));

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(() => {
  limit.allow = true;
});

async function seed(slug: string) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [owner] = await db.insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
  await db.insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
  const [app1] = await db.insert(app).values({ workspaceId: ws.id, name: "one", slug: "one" }).returning();
  const [app2] = await db.insert(app).values({ workspaceId: ws.id, name: "two", slug: "two" }).returning();
  const key1 = (await createApiKey(env, { workspaceId: ws.id, appId: app1.id, name: "k1" })).secret;
  const key2 = (await createApiKey(env, { workspaceId: ws.id, appId: app2.id, name: "k2" })).secret;
  return { key1, key2 };
}

const call = (method: string, path: string, key?: string, body?: unknown) =>
  SELF.fetch(`https://relay.test/api/v1${path}`, {
    method,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

describe("/api/v1 auth and rate limit", () => {
  it("refuses every route without a bearer", async () => {
    for (const [method, path] of [
      ["GET", "/lists"],
      ["POST", "/lists"],
      ["GET", "/campaigns"],
      ["GET", "/templates"],
      ["PUT", "/audience-hook"],
      ["POST", "/import/lists"],
    ] as const) {
      expect((await call(method, path)).status).toBe(401);
    }
  });

  it("gives 429 when the rate limiter refuses", async () => {
    const { key1 } = await seed("api-rate");
    limit.allow = false;
    const res = await call("GET", "/lists", key1);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate limited" });
  });
});

describe("/api/v1 lists and campaigns", () => {
  it("creates a list with 201 and hides it from another app", async () => {
    const { key1, key2 } = await seed("api-lists");
    const created = await call("POST", "/lists", key1, { name: "Customers", consentSource: "express_optin" });
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as { data: { id: string } };
    expect((await call("GET", `/lists/${data.id}`, key2)).status).toBe(404);
    expect((await call("GET", `/lists/${data.id}`, key1)).status).toBe(200);
  });

  it("returns 404 for an unknown campaign action", async () => {
    const { key1 } = await seed("api-action");
    const created = await call("POST", "/campaigns", key1, { name: "C" });
    const { data } = (await created.json()) as { data: { id: string } };
    expect((await call("POST", `/campaigns/${data.id}/explode`, key1, {})).status).toBe(404);
  });

  it("returns 400 invalid input for a malformed JSON body", async () => {
    const { key1 } = await seed("api-malformed");
    const res = await call("POST", "/lists", key1, "{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid input" });
  });

  it("returns 400 invalid input when a template send is missing fields", async () => {
    const { key1 } = await seed("api-tpl-send");
    const res = await call("POST", "/templates/send", key1, {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid input" });
  });
});

describe("/api/v1 audience hook", () => {
  it("refuses a private hook URL and returns the secret once, on PUT only", async () => {
    const { key1 } = await seed("api-hook");
    expect((await call("PUT", "/audience-hook", key1, { url: "https://10.0.0.1/", secret: "0123456789abcdef" })).status).toBe(400);
    const put = await call("PUT", "/audience-hook", key1, { url: "https://audience.example.com/hook" });
    expect(put.status).toBe(200);
    const { data } = (await put.json()) as { data: { secret: string | null } };
    expect(data.secret).not.toBeNull();
    const got = (await (await call("GET", "/audience-hook", key1)).json()) as { data: Record<string, unknown> };
    expect(JSON.stringify(got)).not.toContain("secret");
  });
});

describe("/api/v1 imports and export", () => {
  it("refuses an unknown import kind", async () => {
    const { key1 } = await seed("api-import-kind");
    expect((await call("POST", "/import/widgets", key1, { rows: [] })).status).toBe(404);
  });

  it("starts the export with the header and neutralises a formula cell", async () => {
    const { key1 } = await seed("api-export");
    const created = await call("POST", "/lists", key1, { name: "Export", consentSource: "express_optin" });
    const { data } = (await created.json()) as { data: { id: string } };
    await call("POST", `/lists/${data.id}/members`, key1, { email: "f@x.test", firstName: "=x" });
    const res = await call("GET", `/lists/${data.id}/export`, key1);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.startsWith("email,first_name,")).toBe(true);
    expect(text).toContain("'=x");
  });
});
