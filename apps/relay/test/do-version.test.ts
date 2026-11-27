import { LIMITS_KEY } from "../src/core/limits";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { guardInternal } from "../src/core/internal-guard";
import { sweepWorkspaces } from "../src/jobs/do-sweep";
import * as domains from "../src/services/domain-state";
import { sweepAll } from "../src/jobs/sweep-all";
import { CLIENT_MIGRATIONS } from "../src/do/migrations";
import { coreDb } from "../src/db/core/client";
import { ensureWorkspaceProfile } from "../src/core/workspace-profile";
import { workspaceProfile } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";

const db = securityDb(env);
const VERSION = CLIENT_MIGRATIONS.length;
const SWEEP_URL = "https://relay.test/api/internal/do-sweep";

const base = {
  appId: "app_1",
  stream: "transactional" as const,
  from: "Relay@A6n.ai",
  to: "a@x.com",
  subject: "Order 1",
  html: "<p>Thanks</p>",
  text: "Thanks",
};

const stubFor = (workspaceId: string) => env.CLIENT.get(env.CLIENT.idFromName(workspaceId));

const profileOf = (workspaceId: string) =>
  coreDb(env).select().from(workspaceProfile).where(eq(workspaceProfile.workspaceId, workspaceId));

// Production creates the profile with the workspace (afterCreateOrganization), so seeds do the same.
async function seedWorkspace(slug: string) {
  const [row] = await db.insert(workspace).values({ name: slug, slug }).returning();
  await ensureWorkspaceProfile(env, row.id);
  return row.id;
}

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await db.delete(workspace);
  await coreDb(env).delete(workspaceProfile);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ClientDO schema version", () => {
  it("reports the version to D1 on ping and clears any migrate error", async () => {
    const id = await seedWorkspace("ping-a");
    expect(await stubFor(id).ping(id)).toEqual({ version: VERSION });

    const [row] = await profileOf(id);
    expect(row).toMatchObject({ doSchemaVersion: VERSION, doMigrateError: null });
  });

  it("reports nothing for a workspace id relay-security does not know, then reports once it exists", async () => {
    const id = "wsp_ghost";
    const stub = stubFor(id);
    expect(await stub.ping(id)).toEqual({ version: VERSION });
    expect(await profileOf(id)).toHaveLength(0);
    const unset = await runInDurableObject(stub, (_instance, state) => state.storage.kv.get("reported_version"));
    expect(unset).toBeUndefined();

    await db.insert(workspace).values({ id, name: "ghost", slug: "ghost" });
    await ensureWorkspaceProfile(env, id);
    expect(await stub.ping(id)).toEqual({ version: VERSION });
    const [row] = await profileOf(id);
    expect(row).toMatchObject({ doSchemaVersion: VERSION, doMigrateError: null });
    const kv = await runInDurableObject(stub, (_instance, state) => state.storage.kv.get("reported_version"));
    expect(kv).toBe(VERSION);
  });

  it("writes D1 once per version, not on every call", async () => {
    const id = await seedWorkspace("ping-once");
    const stub = stubFor(id);
    await stub.ping(id);
    await coreDb(env).update(workspaceProfile).set({ updatedAt: new Date(1) }).where(eq(workspaceProfile.workspaceId, id));
    await stub.ping(id);

    const [row] = await profileOf(id);
    expect(row.updatedAt.getTime()).toBe(1);
  });

  it("refuses sends while migrateError is set and writes no message row", async () => {
    const id = await seedWorkspace("blocked");
    const stub = stubFor(id);
    await runInDurableObject(stub, (instance) => {
      instance.migrateError = new Error("boom");
    });
    const failure = await runInDurableObject(stub, (instance) =>
      instance.send(id, base).then(() => "resolved", (e: Error) => e.message),
    );
    expect(failure).toBe("workspace storage migration failed");

    const rows = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec<{ n: number }>("SELECT count(*) AS n FROM message").toArray()[0].n,
    );
    expect(rows).toBe(0);
    const [row] = await profileOf(id);
    expect(row.doMigrateError).toBe("boom");
  });

  it("keeps sends working while D1 is down and reports the version once D1 is back", async () => {
    const id = await seedWorkspace("d1-down");
    const stub = stubFor(id);
    // A snapshot loaded before the outage; a DO that never loaded limits refuses sends.
    await runInDurableObject(stub, (_instance, state) =>
      state.storage.kv.put(LIMITS_KEY, {
        monthlyQuota: 10000,
        status: "active",
        senders: { "relay@a6n.ai": { appId: "app_1", name: null, sesRegion: "ap-south-1" } },
        fetchedAt: Date.now(),
      }),
    );
    const d1 = vi.spyOn(env.CORE_DB, "prepare").mockImplementation(() => {
      throw new Error("D1 down");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const sent = await stub.send(id, base);
    expect(sent.status).toBe("queued");
    expect(log).toHaveBeenCalled();
    const kv = await runInDurableObject(stub, (_instance, state) => state.storage.kv.get("reported_version"));
    expect(kv).toBeUndefined();

    d1.mockRestore();
    log.mockRestore();
    expect(await stub.ping(id)).toEqual({ version: VERSION });
    const [row] = await profileOf(id);
    expect(row.doSchemaVersion).toBe(VERSION);
    const kvAfter = await runInDurableObject(stub, (_instance, state) => state.storage.kv.get("reported_version"));
    expect(kvAfter).toBe(VERSION);
  });

  it("rejects with the migration error even when D1 is down", async () => {
    const id = await seedWorkspace("d1-down-migrate");
    const stub = stubFor(id);
    await runInDurableObject(stub, (instance) => {
      instance.migrateError = new Error("boom");
    });
    const d1 = vi.spyOn(env.CORE_DB, "prepare").mockImplementation(() => {
      throw new Error("D1 down");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const failure = await runInDurableObject(stub, (instance) =>
      instance.send(id, base).then(() => "resolved", (e: Error) => e.message),
    );
    expect(failure).toBe("workspace storage migration failed");
    expect(log).toHaveBeenCalled();
    d1.mockRestore();
    log.mockRestore();
  });
});

describe("sweepWorkspaces", () => {
  it("pings every workspace and reports all of them up to date", async () => {
    const created = await db.insert(workspace).values([
      { name: "s1", slug: "s1" },
      { name: "s2", slug: "s2" },
      { name: "s3", slug: "s3" },
    ]).returning({ id: workspace.id });
    for (const { id } of created) await ensureWorkspaceProfile(env, id);

    expect(await sweepWorkspaces(env)).toEqual({ total: 3, upToDate: 3, behind: [], failed: [] });
    const rows = await coreDb(env).select({ version: workspaceProfile.doSchemaVersion }).from(workspaceProfile);
    expect(rows.map((r) => r.version)).toEqual([VERSION, VERSION, VERSION]);
  });

  it("lists a workspace whose migration failed and records the error in D1", async () => {
    const id = await seedWorkspace("broken");
    await runInDurableObject(stubFor(id), (instance) => {
      instance.migrateError = new Error("boom");
    });

    expect(await sweepWorkspaces(env)).toEqual({
      total: 1,
      upToDate: 0,
      behind: [id],
      failed: [{ workspaceId: id, error: "workspace storage migration failed" }],
    });
    const [row] = await profileOf(id);
    expect(row.doMigrateError).toBe("boom");
  });
});

describe("POST /api/internal/do-sweep", () => {
  it("returns 404 when the secret is unset, before checking the bearer", () => {
    expect(guardInternal(new Request(SWEEP_URL, { method: "POST" }), undefined)?.status).toBe(404);
  });

  it("returns 401 for a wrong bearer", async () => {
    const res = await SELF.fetch(SWEEP_URL, { method: "POST", headers: { authorization: "Bearer wrong" } });
    expect(res.status).toBe(401);
  });

  it("returns 200 with the sweep summary for the right bearer", async () => {
    await seedWorkspace("route");
    const res = await SELF.fetch(SWEEP_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.INTERNAL_SECRET}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 1, upToDate: 1, behind: [], failed: [], releasedDomains: 0 });
  });
});

describe("sweepAll", () => {
  it("still returns the sweep summary when the domain release throws", async () => {
    vi.spyOn(domains, "releaseStalePendingDomains").mockRejectedValueOnce(new Error("d1 down"));
    expect(await sweepAll(env)).toMatchObject({ releasedDomains: 0, failed: [] });
  });
});
