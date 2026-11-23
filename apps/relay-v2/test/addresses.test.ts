import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createAddress, createAddressGrant } from "../src/core/addresses";
import { coreDb } from "../src/db/core/client";
import { address } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { addressGrant, app, member, user, workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

async function tenant(slug: string) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [a] = await db.insert(app).values({ workspaceId: ws.id, name: slug, slug: "main" }).returning();
  return { workspaceId: ws.id, appId: a.id };
}

describe("cross-database checks", () => {
  it("refuses an address whose app belongs to another workspace", async () => {
    const a = await tenant("addr-a");
    const b = await tenant("addr-b");
    await expect(
      createAddress(env, { workspaceId: a.workspaceId, appId: b.appId, email: "x@a.test", kind: "sender" }),
    ).rejects.toThrow("app does not belong to workspace");
    expect(await coreDb(env).select().from(address)).toHaveLength(0);
  });

  it("creates an address for the app's workspace with a normalised email", async () => {
    const a = await tenant("addr-ok");
    const { id } = await createAddress(env, {
      workspaceId: a.workspaceId,
      appId: a.appId,
      email: " Hello@Addr-Ok.test ",
      kind: "inbox",
    });
    const [row] = await coreDb(env).select().from(address).where(eq(address.id, id));
    expect(row).toMatchObject({ workspaceId: a.workspaceId, appId: a.appId, email: "hello@addr-ok.test" });
  });

  it("refuses a grant for an address that is missing or in another workspace", async () => {
    const a = await tenant("grant-a");
    const b = await tenant("grant-b");
    const { id } = await createAddress(env, { workspaceId: a.workspaceId, appId: a.appId, email: "g@grant-a.test", kind: "both" });
    const [m] = await securityDb(env)
      .insert(user)
      .values({ id: "usr_grant", name: "g", email: "grant-member@grant-a.test" })
      .returning();
    const [mem] = await securityDb(env)
      .insert(member)
      .values({ organizationId: a.workspaceId, userId: m.id, role: "member" })
      .returning();

    await expect(
      createAddressGrant(env, { workspaceId: b.workspaceId, addressId: id, memberId: mem.id }),
    ).rejects.toThrow("address does not belong to workspace");
    await expect(
      createAddressGrant(env, { workspaceId: a.workspaceId, addressId: "adr_missing", memberId: mem.id }),
    ).rejects.toThrow("address does not belong to workspace");

    await createAddressGrant(env, { workspaceId: a.workspaceId, addressId: id, memberId: mem.id });
    expect(await securityDb(env).select().from(addressGrant)).toHaveLength(1);
  });

  it("refuses a grant whose member belongs to another workspace, and inserts nothing", async () => {
    const a = await tenant("ggrant-a");
    const b = await tenant("ggrant-b");
    const { id } = await createAddress(env, { workspaceId: a.workspaceId, appId: a.appId, email: "w1@ggrant-a.test", kind: "both" });
    const [u] = await securityDb(env)
      .insert(user)
      .values({ id: "usr_w2", name: "w2", email: "w2-member@ggrant-b.test" })
      .returning();
    const [mem] = await securityDb(env)
      .insert(member)
      .values({ organizationId: b.workspaceId, userId: u.id, role: "member" })
      .returning();

    await expect(
      createAddressGrant(env, { workspaceId: a.workspaceId, addressId: id, memberId: mem.id }),
    ).rejects.toThrow("grantee does not belong to workspace");
    expect(await securityDb(env).select().from(addressGrant).where(eq(addressGrant.addressId, id))).toHaveLength(0);
  });
});
