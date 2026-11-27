import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import domainsFns from "../src/console/domains.fns.ts?raw";
import { createPersonalAddress, inboxForRecipient } from "../src/core/addresses";
import { coreDb } from "../src/db/core/client";
import { address } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { app, member, user } from "../src/db/security/schema";
import { closePersonalMailbox, listPersonalMailboxes, reopenPersonalMailbox } from "../src/services/personal-mailboxes";
import { addMember, cookieFor, createWorkspace, headersFor, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

const db = securityDb(env);

async function setup(slug: string) {
  const cookie = await cookieFor(`${slug}-owner@example.com`, "user");
  const workspaceId = await createWorkspace(cookie, slug);
  await setActive(cookie, workspaceId);
  const [a] = await db.insert(app).values({ workspaceId, name: slug, slug }).returning();
  const owner = await requireActor(env, headersFor(cookie));
  const memberEmail = `${slug}-ravi@example.com`;
  const memberCookie = await addMember(workspaceId, memberEmail, "member");
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, memberEmail));
  await db.update(user).set({ recoveryEmail: "ravi.home@gmail.com" }).where(eq(user.id, u.id));
  const email = `ravi@${slug}.test`;
  const id = await createPersonalAddress(env, { workspaceId, appId: a.id, email, ownerUserId: u.id, displayName: "Ravi" });
  return { workspaceId, owner, memberActor: await requireActor(env, headersFor(memberCookie)), id, email, userId: u.id };
}

describe("personal mailboxes service", () => {
  it("lists own-workspace personal rows with masked recovery email", async () => {
    const t = await setup("pm-list");
    const other = await setup("pm-list-other");
    const rows = await listPersonalMailboxes(env, t.owner);
    expect(rows.map((r) => r.id)).toEqual([t.id]);
    expect(rows[0]).toMatchObject({ email: t.email, recoveryEmail: "r***@gmail.com", closed: false, canRead: true });
    expect(rows.map((r) => r.id)).not.toContain(other.id);
  });

  it("refuses a member", async () => {
    const t = await setup("pm-member");
    await expect(listPersonalMailboxes(env, t.memberActor)).rejects.toMatchObject({ status: 403 });
    await expect(closePersonalMailbox(env, t.memberActor, t.id)).rejects.toMatchObject({ status: 403 });
  });

  it("refuses another workspace's address", async () => {
    const t = await setup("pm-ws");
    const other = await setup("pm-ws-other");
    await expect(closePersonalMailbox(env, t.owner, other.id)).rejects.toMatchObject({ status: 404 });
  });

  it("close stops delivery, reopen restores it while a member", async () => {
    const t = await setup("pm-close");
    await closePersonalMailbox(env, t.owner, t.id);
    expect(await inboxForRecipient(env, t.email)).toBeNull();
    expect((await listPersonalMailboxes(env, t.owner))[0].closed).toBe(true);
    await reopenPersonalMailbox(env, t.owner, t.id);
    expect(await inboxForRecipient(env, t.email)).toMatchObject({ addressId: t.id });
    const [row] = await coreDb(env).select().from(address).where(eq(address.id, t.id));
    expect(row).toMatchObject({ canSend: true, closedAt: null });
  });

  it("reopen is refused once the owner is no longer a member", async () => {
    const t = await setup("pm-gone");
    await closePersonalMailbox(env, t.owner, t.id);
    await db.delete(member).where(eq(member.userId, t.userId));
    await expect(reopenPersonalMailbox(env, t.owner, t.id)).rejects.toMatchObject({ message: "invalid input" });
    expect(await inboxForRecipient(env, t.email)).toBeNull();
  });
});

describe("Domains server functions", () => {
  it("need sending:write, which a member lacks", async () => {
    const t = await setup("pm-fns");
    expect(domainsFns).not.toContain('READ("sending", "read")');
    expect(domainsFns).toContain('READ("sending", "write")');
    await expect(
      requireActor(env, headersFor(await addMember(t.workspaceId, "pm-fns-m2@example.com", "member")), { permission: { sending: ["write"] } }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
