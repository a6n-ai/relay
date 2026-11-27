import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { deleteWorkspace } from "../src/services/workspaces";
import { ensureWorkspaceProfile } from "../src/core/workspace-profile";
import { coreDb } from "../src/db/core/client";
import { sendingDomain, workspaceProfile } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { app, workspace } from "../src/db/security/schema";
import { addMember, cookieFor, createWorkspace, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

const db = securityDb(env);
const OWNER = { permission: { organization: ["delete"] }, write: true } as const;

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

async function ownerWorkspace(email: string, slug: string) {
  const cookie = await cookieFor(email, "user");
  const workspaceId = await createWorkspace(cookie, slug);
  await setActive(cookie, workspaceId);
  await ensureWorkspaceProfile(env, workspaceId);
  const headers = new Headers({ cookie, origin: ORIGIN });
  return { workspaceId, headers, actor: await requireActor(env, headers, OWNER) };
}

describe("deleteWorkspace", { timeout: 60_000 }, () => {
  it("refuses a member who is not the owner", async () => {
    const { workspaceId } = await ownerWorkspace("del-owner-1@example.com", "del-one");
    const admin = await addMember(workspaceId, "del-admin-1@example.com", "admin");
    await expect(requireActor(env, new Headers({ cookie: admin }), OWNER)).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a slug that does not match", async () => {
    const { workspaceId, headers, actor } = await ownerWorkspace("del-owner-2@example.com", "del-two");
    await expect(deleteWorkspace(env, actor, headers, "other")).rejects.toMatchObject({ status: 400 });
    expect(await db.select().from(workspace).where(eq(workspace.id, workspaceId))).toHaveLength(1);
  });

  it("refuses while the workspace has apps or domains, and says what to remove", async () => {
    const { workspaceId, headers, actor } = await ownerWorkspace("del-owner-3@example.com", "del-three");
    await db.insert(app).values([
      { workspaceId, name: "A", slug: "a" },
      { workspaceId, name: "B", slug: "b" },
    ]);
    await coreDb(env).insert(sendingDomain).values({ workspaceId, domain: "del-three.test", sesRegion: "us-east-1", status: "verified" });
    await expect(deleteWorkspace(env, actor, headers, "del-three")).rejects.toMatchObject({
      status: 409,
      message: "Remove its 2 apps and 1 domain first.",
    });
    expect(await db.select().from(workspace).where(eq(workspace.id, workspaceId))).toHaveLength(1);
  });

  it("deletes an empty workspace for its owner, with its core rows", async () => {
    const { workspaceId, headers, actor } = await ownerWorkspace("del-owner-4@example.com", "del-four");
    await deleteWorkspace(env, actor, headers, "del-four");
    expect(await db.select().from(workspace).where(eq(workspace.id, workspaceId))).toHaveLength(0);
    expect(await coreDb(env).select().from(workspaceProfile).where(eq(workspaceProfile.workspaceId, workspaceId))).toHaveLength(0);
  });
});
