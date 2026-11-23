import { env, applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { centralDb } from "../src/db/central/client";
import { address, addressGrant, app, workspace } from "../src/db/central/schema";

const { TEST_MIGRATIONS } = env as typeof env & { TEST_MIGRATIONS: D1Migration[] };

beforeAll(async () => {
  await applyD1Migrations(env.CENTRAL, TEST_MIGRATIONS);
});

async function seedWorkspace(slug: string) {
  const db = centralDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  return { db, ws };
}

describe("central schema constraints", () => {
  it("rejects a second app with the same workspace and slug", async () => {
    const { db, ws } = await seedWorkspace("dup-app");
    await db.insert(app).values({ workspaceId: ws.id, name: "One", slug: "one" });
    await expect(
      db.insert(app).values({ workspaceId: ws.id, name: "Two", slug: "one" }),
    ).rejects.toHaveProperty("cause.message", expect.stringMatching(/UNIQUE constraint failed/));
  });

  it("rejects a duplicate address email", async () => {
    const { db, ws } = await seedWorkspace("dup-address");
    const [a] = await db.insert(app).values({ workspaceId: ws.id, name: "A", slug: "a" }).returning();
    const row = { workspaceId: ws.id, appId: a.id, email: "x@dup.test", kind: "sender" as const, displayName: "X", canSend: true };
    await db.insert(address).values(row);
    await expect(db.insert(address).values(row)).rejects.toHaveProperty("cause.message", expect.stringMatching(/UNIQUE constraint failed/));
  });

  it("rejects a non-lowercased address email", async () => {
    const { db, ws } = await seedWorkspace("case-address");
    const [a] = await db.insert(app).values({ workspaceId: ws.id, name: "A", slug: "a" }).returning();
    await expect(
      db.insert(address).values({ workspaceId: ws.id, appId: a.id, email: "X@Dup.test", kind: "sender", displayName: "X", canSend: true }),
    ).rejects.toHaveProperty("cause.message", expect.stringMatching(/CHECK constraint failed/));
  });

  it("rejects an address grant with neither member nor team", async () => {
    const { db, ws } = await seedWorkspace("grant-check");
    const [a] = await db.insert(app).values({ workspaceId: ws.id, name: "A", slug: "a" }).returning();
    const [addr] = await db
      .insert(address)
      .values({ workspaceId: ws.id, appId: a.id, email: "y@grant.test", kind: "inbox", displayName: "Y", canSend: false })
      .returning();
    await expect(
      db.insert(addressGrant).values({ workspaceId: ws.id, addressId: addr.id }),
    ).rejects.toHaveProperty("cause.message", expect.stringMatching(/CHECK constraint failed/));
  });
});
