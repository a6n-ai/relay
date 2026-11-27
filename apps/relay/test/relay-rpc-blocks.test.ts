import { createExecutionContext, env, runInDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApiKey } from "../src/services/api-keys";
import { securityDb } from "../src/db/security/client";
import { app, member, user, workspace } from "../src/db/security/schema";
import { RelayRpc } from "../src/rpc/relay-rpc";
import type { Stream, SuppressionReason } from "../src/shared/mail";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

async function seed(slug: string) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [owner] = await db.insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
  await db.insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
  const [one] = await db.insert(app).values({ workspaceId: ws.id, name: "one", slug: "one" }).returning();
  const key = (await createApiKey(env, { workspaceId: ws.id, appId: one.id, name: "k" })).secret;
  const rpc = new RelayRpc(createExecutionContext(), env);
  // Runs the DO migrations before any raw insert.
  await rpc.suppressionStatus(key, ["none@x.test"]);
  const stub = env.CLIENT.get(env.CLIENT.idFromName(ws.id));
  const sql = (query: string, ...params: (string | number | null)[]) =>
    runInDurableObject(stub, (_i, state) => state.storage.sql.exec(query, ...params).toArray());
  const block = (email: string, reason: SuppressionReason, stream: Stream | null = null, createdAt = Date.now(), source: string | null = null) =>
    sql("INSERT INTO suppression (email, reason, stream, source, created_at) VALUES (?, ?, ?, ?, ?)", email, reason, stream, source, createdAt);
  const optOut = (email: string, domain = "x.test", createdAt = Date.now()) =>
    sql("INSERT INTO marketing_optout (email, domain, created_at) VALUES (?, ?, ?)", email, domain, createdAt);
  return { rpc, key, sql, block, optOut };
}

describe("RelayRpc block list", () => {
  it("counts a brand opt-out and an unsubscribe block for one address once", async () => {
    const { rpc, key, block, optOut } = await seed("blocks-once");
    await block("a@x.test", "unsubscribe");
    await optOut("a@x.test");
    await optOut("b@x.test", "y.test", 200);
    await optOut("b@x.test", "x.test", 100);
    const list = await rpc.listSuppressions(key, { reasons: ["unsubscribe"] });
    expect(list.total).toBe(2);
    expect(list.rows.find((r) => r.email === "b@x.test")).toEqual({
      email: "b@x.test",
      reason: "unsubscribe",
      stream: "marketing",
      source: null,
      campaignRef: null,
      campaignName: null,
      createdAt: 100,
    });
    const summary = await rpc.suppressionSummary(key);
    expect(summary.total).toEqual({ unsubscribe: 2, bounce: 0, complaint: 0, manual: 0 });
  });

  it("summarises the last 30 days and this month", async () => {
    const { rpc, key, block } = await seed("blocks-summary");
    await block("old@x.test", "bounce", null, 1);
    await block("new@x.test", "bounce", null, Date.now());
    const summary = await rpc.suppressionSummary(key);
    expect([summary.total.bounce, summary.last30.bounce, summary.thisMonth.bounce]).toEqual([2, 1, 1]);
  });

  it("filters by stream, source, date range and address substring", async () => {
    const { rpc, key, block } = await seed("blocks-filter");
    await block("alice@x.test", "manual", null, 100, "admin");
    await block("bob@x.test", "bounce", "marketing", 200, "ses");
    await block("carol@x.test", "complaint", "tracked", 300);
    const emails = async (q: Parameters<typeof rpc.listSuppressions>[1]) => (await rpc.listSuppressions(key, q)).rows.map((r) => r.email);
    expect(await emails({ streams: ["all"] })).toEqual(["alice@x.test"]);
    expect(await emails({ streams: ["all", "marketing"] })).toEqual(["bob@x.test", "alice@x.test"]);
    expect(await emails({ sources: ["ses"] })).toEqual(["bob@x.test"]);
    expect(await emails({ search: " LICE@x " })).toEqual(["alice@x.test"]);
    expect(await emails({ from: 200, to: 300 })).toEqual(["carol@x.test", "bob@x.test"]);
    expect(await emails({ reasons: [], streams: [], sources: [] })).toHaveLength(3);
  });

  it("sorts and pages with a total", async () => {
    const { rpc, key, block } = await seed("blocks-page");
    for (const email of ["c@x.test", "a@x.test", "b@x.test"]) await block(email, "manual");
    const page = await rpc.listSuppressions(key, { sort: "address", dir: "asc", offset: 1, limit: 1 });
    expect(page.rows.map((r) => r.email)).toEqual(["b@x.test"]);
    expect(page.total).toBe(3);
    expect((await rpc.listSuppressions(key, { offset: 10 })).total).toBe(3);
  });

  it("refuses a limit above 500", async () => {
    const { rpc, key } = await seed("blocks-limit");
    await expect(rpc.listSuppressions(key, { limit: 501 })).rejects.toThrow("invalid input");
  });

  it("shows only this workspace's blocks", async () => {
    const first = await seed("blocks-mine");
    await first.block("a@x.test", "manual");
    const other = await seed("blocks-other");
    expect(await other.rpc.listSuppressions(other.key, {})).toEqual({ rows: [], total: 0 });
  });
});
