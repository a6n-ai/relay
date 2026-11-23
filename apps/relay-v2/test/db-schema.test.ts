import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { coreDb } from "../src/db/core/client";
import { address } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { addressGrant, app, workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

async function seedWorkspace(slug: string) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  return { db, ws };
}

describe("relay-security schema constraints", () => {
  it("rejects a second app with the same workspace and slug", async () => {
    const { db, ws } = await seedWorkspace("dup-app");
    await db.insert(app).values({ workspaceId: ws.id, name: "One", slug: "one" });
    await expect(
      db.insert(app).values({ workspaceId: ws.id, name: "Two", slug: "one" }),
    ).rejects.toHaveProperty("cause.message", expect.stringMatching(/UNIQUE constraint failed/));
  });

  it("rejects an address grant with neither member nor team", async () => {
    const { db, ws } = await seedWorkspace("grant-check");
    await expect(
      db.insert(addressGrant).values({ workspaceId: ws.id, addressId: "adr_x" }),
    ).rejects.toHaveProperty("cause.message", expect.stringMatching(/CHECK constraint failed/));
  });
});

describe("relay-core schema constraints", () => {
  const row = { workspaceId: "wsp_core", appId: "app_core", kind: "sender" as const, displayName: "X", canSend: true };

  it("rejects a duplicate address email", async () => {
    const db = coreDb(env);
    await db.insert(address).values({ ...row, email: "x@dup.test" });
    await expect(db.insert(address).values({ ...row, email: "x@dup.test" })).rejects.toHaveProperty(
      "cause.message",
      expect.stringMatching(/UNIQUE constraint failed/),
    );
  });

  it("rejects a non-lowercased address email", async () => {
    await expect(
      coreDb(env).insert(address).values({ ...row, email: "X@Dup.test" }),
    ).rejects.toHaveProperty("cause.message", expect.stringMatching(/CHECK constraint failed/));
  });
});
