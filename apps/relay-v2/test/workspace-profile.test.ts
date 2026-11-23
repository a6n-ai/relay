import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getWorkspaceProfile } from "../src/core/workspace-profile";
import { coreDb } from "../src/db/core/client";
import { workspaceProfile } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await coreDb(env).delete(workspaceProfile);
  await securityDb(env).delete(workspace);
});

describe("getWorkspaceProfile", () => {
  it("recreates a deleted profile with defaults on read", async () => {
    const [ws] = await securityDb(env).insert(workspace).values({ name: "p", slug: "p" }).returning();
    await coreDb(env).insert(workspaceProfile).values({ workspaceId: ws.id, monthlyMessageQuota: 5 });
    await coreDb(env).delete(workspaceProfile).where(eq(workspaceProfile.workspaceId, ws.id));

    const profile = await getWorkspaceProfile(env, ws.id);
    expect(profile).toMatchObject({
      workspaceId: ws.id,
      mailingCountry: "CA",
      monthlyMessageQuota: 10000,
      defaultSesRegion: "ap-south-1",
      doSchemaVersion: 0,
      doMigrateError: null,
    });
    expect(await coreDb(env).select().from(workspaceProfile).where(eq(workspaceProfile.workspaceId, ws.id))).toHaveLength(1);
  });

  it("refuses a workspace id that relay-security does not know", async () => {
    await expect(getWorkspaceProfile(env, "wsp_missing")).rejects.toThrow("workspace not found");
    expect(await coreDb(env).select().from(workspaceProfile)).toHaveLength(0);
  });
});
