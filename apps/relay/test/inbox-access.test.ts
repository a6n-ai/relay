import { env, runInDurableObject } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { createAddress, createPersonalAddress, inboxForRecipient } from "../src/core/addresses";
import { updateWorkspaceProfile } from "../src/core/workspace-profile";
import { clientFor } from "../src/do/client";
import { securityDb } from "../src/db/security/client";
import { app, user } from "../src/db/security/schema";
import { getMessage, messageAccess } from "../src/services/inbox";
import { listFailures } from "../src/services/failures";
import { newId } from "../src/shared/ids";
import { addMember, cookieFor, createWorkspace, headersFor, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

const db = securityDb(env);

async function actorOf(workspaceId: string, email: string, role: "member" | "admin") {
  const cookie = await addMember(workspaceId, email, role);
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return { actor: await requireActor(env, headersFor(cookie)), userId: u.id };
}

async function setup(slug: string) {
  const cookie = await cookieFor(`${slug}-owner@example.com`, "user");
  const workspaceId = await createWorkspace(cookie, slug);
  await setActive(cookie, workspaceId);
  const [a] = await db.insert(app).values({ workspaceId, name: slug, slug }).returning();
  const admin = await actorOf(workspaceId, `${slug}-admin@example.com`, "admin");
  const ravi = await actorOf(workspaceId, `${slug}-ravi@example.com`, "member");
  const sam = await actorOf(workspaceId, `${slug}-sam@example.com`, "member");
  const personal = (u: { userId: string }, name: string) =>
    createPersonalAddress(env, { workspaceId, appId: a.id, email: `${name}@${slug}.test`, ownerUserId: u.userId, displayName: name });
  return { workspaceId, appId: a.id, admin, ravi, sam, raviBox: await personal(ravi, "ravi"), samBox: await personal(sam, "sam") };
}

async function seedInbound(workspaceId: string, appId: string, addressId: string): Promise<string> {
  const id = newId("msg");
  await runInDurableObject(clientFor(env, workspaceId), (_i, state) => {
    state.storage.sql.exec(
      "INSERT INTO message (id, app_id, direction, stream, status, address_id, created_at, updated_at) VALUES (?, ?, 'in', 'transactional', 'sent', ?, 1, 1)",
      id,
      appId,
      addressId,
    );
  });
  return id;
}

describe("personal mailbox read access", () => {
  it("member sees own personal mailbox", async () => {
    const t = await setup("pa-own");
    expect((await messageAccess(env, t.ravi.actor)).inbound).toEqual([t.raviBox]);
  });

  it("member does not see another member's", async () => {
    const t = await setup("pa-other");
    expect((await messageAccess(env, t.ravi.actor)).inbound).not.toContain(t.samBox);
  });

  it("admin sees personal by default", async () => {
    const t = await setup("pa-admin");
    expect(await messageAccess(env, t.admin.actor)).toEqual({ out: true, inbound: "all" });
  });

  it("admin blocked when setting off", async () => {
    const t = await setup("pa-off");
    await updateWorkspaceProfile(env, t.workspaceId, { adminsReadPersonal: false });
    const access = await messageAccess(env, t.admin.actor);
    expect(access.exceptInbound?.sort()).toEqual([t.raviBox, t.samBox].sort());
    const letter = await seedInbound(t.workspaceId, t.appId, t.raviBox);
    await expect(getMessage(env, t.admin.actor, letter, { images: false })).rejects.toMatchObject({ status: 404 });
    await expect(getMessage(env, t.ravi.actor, letter, { images: false })).resolves.toMatchObject({ id: letter });
  });

  it("failures hide a blocked personal mailbox", async () => {
    const t = await setup("pa-fail");
    await updateWorkspaceProfile(env, t.workspaceId, { adminsReadPersonal: false });
    const shared = (await createAddress(env, { workspaceId: t.workspaceId, appId: t.appId, email: "hi@pa-fail.test", kind: "inbox" })).id;
    for (const [i, addressId] of [t.raviBox, shared].entries())
      await runInDurableObject(clientFor(env, t.workspaceId), (_i, state) => {
        state.storage.sql.exec(
          "INSERT INTO inbound_failure (id, raw_key, app_id, address_id, envelope_to, error, attempts, received_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'x@y.test', 'e', 1, 1, 1, 1)",
          newId("msg"),
          `k${i}`,
          t.appId,
          addressId,
        );
      });
    expect((await listFailures(env, t.admin.actor)).map((f) => f.addressId)).toEqual([shared]);
  });

  it("inbound to personal mailbox is accepted", async () => {
    const t = await setup("pa-in");
    expect(await inboxForRecipient(env, "ravi@pa-in.test")).toMatchObject({ addressId: t.raviBox, workspaceId: t.workspaceId });
  });
});
