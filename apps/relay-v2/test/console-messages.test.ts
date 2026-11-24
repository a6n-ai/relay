import { env, runInDurableObject } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { getMessageFor, listMessagesFor } from "../src/console/messages";
import { createAddress, createAddressGrant } from "../src/core/addresses";
import { clientFor } from "../src/core/messages";
import { securityDb } from "../src/db/security/client";
import { addressGrant, app, member, team, teamMember, user } from "../src/db/security/schema";
import { parseMessagesSearch } from "../src/components/messages-search";
import { newId } from "../src/lib/ids";
import { addMember, cookieFor, createWorkspace, headersFor, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

const db = securityDb(env);

type Row = {
  appId: string;
  direction: "in" | "out";
  status?: "queued" | "sent" | "failed" | "suppressed";
  fromEmail?: string;
  toEmail?: string;
  subject?: string;
  error?: string;
  createdAt: number;
  addressId?: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  rfcReferences?: string;
};

// Rows go straight into the workspace's DO, so each test controls created_at and the reply headers exactly.
async function seed(workspaceId: string, rows: Row[]): Promise<string[]> {
  const ids = rows.map(() => newId("msg"));
  await runInDurableObject(clientFor(env, workspaceId), (_instance, state) => {
    rows.forEach((r, i) => {
      state.storage.sql.exec(
        "INSERT INTO message (id, app_id, direction, stream, status, from_email, to_email, subject, error, address_id, rfc_message_id, in_reply_to, rfc_references, created_at, updated_at) VALUES (?, ?, ?, 'transactional', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ids[i],
        r.appId,
        r.direction,
        r.status ?? "sent",
        r.fromEmail ?? null,
        r.toEmail ?? null,
        r.subject ?? null,
        r.error ?? null,
        r.addressId ?? null,
        r.rfcMessageId ?? null,
        r.inReplyTo ?? null,
        r.rfcReferences ?? null,
        r.createdAt,
        r.createdAt,
      );
    });
  });
  return ids;
}

async function tenant(slug: string) {
  const ownerCookie = await cookieFor(`${slug}-owner@example.com`, "user");
  const workspaceId = await createWorkspace(ownerCookie, slug);
  await setActive(ownerCookie, workspaceId);
  const [appA] = await db.insert(app).values({ workspaceId, name: "App A", slug: "a" }).returning();
  const [appB] = await db.insert(app).values({ workspaceId, name: "App B", slug: "b" }).returning();
  const owner = await requireActor(env, headersFor(ownerCookie));
  return { workspaceId, appA: appA.id, appB: appB.id, owner };
}

async function inbox(workspaceId: string, appId: string, email: string): Promise<string> {
  const { id } = await createAddress(env, { workspaceId, appId, email, kind: "inbox" });
  return id;
}

async function memberOf(workspaceId: string, email: string, role: "member" | "billing") {
  const cookie = await addMember(workspaceId, email, role);
  const actor = await requireActor(env, headersFor(cookie));
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  const [m] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, u.id)));
  return { actor, userId: u.id, memberId: m.id };
}

describe("message reads", () => {
  it("pages by cursor in (createdAt, id) order, 50 rows at a time", async () => {
    const t = await tenant("pages");
    await seed(
      t.workspaceId,
      Array.from({ length: 120 }, (_, i) => ({
        appId: t.appA,
        direction: "out" as const,
        toEmail: `c${i}@example.com`,
        createdAt: 1000 + Math.floor(i / 3),
      })),
    );
    const p1 = await listMessagesFor(env, t.owner, { direction: "out" });
    expect(p1.rows).toHaveLength(50);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await listMessagesFor(env, t.owner, { direction: "out", cursor: p1.nextCursor ?? undefined });
    expect(p2.rows).toHaveLength(50);
    const p3 = await listMessagesFor(env, t.owner, { direction: "out", cursor: p2.nextCursor ?? undefined });
    expect(p3.rows).toHaveLength(20);
    expect(p3.nextCursor).toBeNull();
    const all = [...p1.rows, ...p2.rows, ...p3.rows];
    expect(new Set(all.map((r) => r.id)).size).toBe(120);
    for (let i = 1; i < all.length; i++) {
      const [prev, cur] = [all[i - 1], all[i]];
      expect(prev.createdAt > cur.createdAt || (prev.createdAt === cur.createdAt && prev.id > cur.id)).toBe(true);
    }
  });

  it("refuses a malformed cursor with 400", async () => {
    const t = await tenant("cursor");
    await expect(listMessagesFor(env, t.owner, { direction: "out", cursor: "x" })).rejects.toMatchObject({
      status: 400,
      message: "invalid cursor",
    });
  });

  it("filters by status, app and exact recipient email, lowercasing the email", async () => {
    const t = await tenant("filters");
    await seed(t.workspaceId, [
      { appId: t.appA, direction: "out", status: "failed", toEmail: "cust@example.com", createdAt: 1 },
      { appId: t.appA, direction: "out", status: "sent", toEmail: "cust@example.com", createdAt: 2 },
      { appId: t.appB, direction: "out", status: "failed", toEmail: "other@example.com", createdAt: 3 },
    ]);
    const failed = await listMessagesFor(env, t.owner, { direction: "out", status: "failed" });
    expect(failed.rows.map((r) => r.createdAt)).toEqual([3, 1]);
    const appB = await listMessagesFor(env, t.owner, { direction: "out", appId: t.appB });
    expect(appB.rows.map((r) => r.createdAt)).toEqual([3]);
    const byEmail = await listMessagesFor(env, t.owner, { direction: "out", email: "Cust@Example.com " });
    expect(byEmail.rows.map((r) => r.createdAt)).toEqual([2, 1]);
  });

  it("shows a member only the inboxes granted to them, directly or through a team", async () => {
    const t = await tenant("grants");
    const in1 = await inbox(t.workspaceId, t.appA, "in1@grants.test");
    const in2 = await inbox(t.workspaceId, t.appA, "in2@grants.test");
    const [a1, a2] = await seed(t.workspaceId, [
      { appId: t.appA, direction: "in", addressId: in1, fromEmail: "x@example.com", rfcMessageId: "a1@x", createdAt: 1 },
      { appId: t.appA, direction: "in", addressId: in2, fromEmail: "y@example.com", rfcMessageId: "a2@x", createdAt: 2 },
    ]);
    const m = await memberOf(t.workspaceId, "grants-member@example.com", "member");

    expect(await listMessagesFor(env, m.actor, { direction: "in" })).toMatchObject({ rows: [], restricted: true });

    await createAddressGrant(env, { workspaceId: t.workspaceId, addressId: in1, memberId: m.memberId });
    const direct = await listMessagesFor(env, m.actor, { direction: "in" });
    expect(direct.rows.map((r) => r.id)).toEqual([a1]);

    const [tm] = await db.insert(team).values({ name: "Support", organizationId: t.workspaceId }).returning();
    await db.insert(teamMember).values({ teamId: tm.id, userId: m.userId });
    await createAddressGrant(env, { workspaceId: t.workspaceId, addressId: in2, teamId: tm.id });
    const viaTeam = await listMessagesFor(env, m.actor, { direction: "in" });
    expect(viaTeam.rows.map((r) => r.id).sort()).toEqual([a1, a2].sort());

    const owner = await listMessagesFor(env, t.owner, { direction: "in" });
    expect(owner.restricted).toBe(false);
    expect(owner.rows).toHaveLength(2);

    await db.delete(addressGrant).where(eq(addressGrant.teamId, tm.id));
    await expect(getMessageFor(env, m.actor, a2, { images: false })).rejects.toMatchObject({ status: 404 });
    await expect(getMessageFor(env, m.actor, a1, { images: false })).resolves.toMatchObject({ id: a1 });
  });

  it("lets billing list outbound mail and refuses inbound", async () => {
    const t = await tenant("billing");
    await seed(t.workspaceId, [{ appId: t.appA, direction: "out", toEmail: "c@example.com", createdAt: 1 }]);
    const b = await memberOf(t.workspaceId, "billing-user@example.com", "billing");
    const out = await listMessagesFor(env, b.actor, { direction: "out" });
    expect(out.rows).toHaveLength(1);
    await expect(listMessagesFor(env, b.actor, { direction: "in" })).rejects.toMatchObject({ status: 403 });
  });

  it("returns events in occurrence order and no storage keys", async () => {
    const t = await tenant("detail");
    const [id] = await seed(t.workspaceId, [{ appId: t.appA, direction: "out", toEmail: "c@example.com", createdAt: 1 }]);
    await runInDurableObject(clientFor(env, t.workspaceId), (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO message_event (id, message_id, type, sns_message_id, occurred_at, created_at) VALUES (?, ?, 'Delivery', 'sns-delivery', 2000, 2000)",
        newId("mev"),
        id,
      );
      state.storage.sql.exec(
        "INSERT INTO message_event (id, message_id, type, sns_message_id, occurred_at, created_at) VALUES (?, ?, 'Send', 'sns-send', 1000, 1000)",
        newId("mev"),
        id,
      );
    });
    const view = await getMessageFor(env, t.owner, id, { images: false });
    expect(view.events.map((e) => [e.type, e.occurredAt])).toEqual([
      ["Send", 1000],
      ["Delivery", 2000],
    ]);
    expect(view).not.toHaveProperty("htmlKey");
    expect(view).not.toHaveProperty("rawKey");
    expect(view).not.toHaveProperty("idempotencyKey");
    expect(view).not.toHaveProperty("claimedUntil");
  });

  it("links letters to their thread, and hides thread rows the reader cannot see", async () => {
    const t = await tenant("thread");
    const in1 = await inbox(t.workspaceId, t.appA, "in1@thread.test");
    const in2 = await inbox(t.workspaceId, t.appA, "in2@thread.test");
    const [l1, l2] = await seed(t.workspaceId, [
      { appId: t.appA, direction: "in", addressId: in1, rfcMessageId: "a@x", subject: "Invoice", createdAt: 1 },
      {
        appId: t.appA,
        direction: "in",
        addressId: in2,
        rfcMessageId: "b@x",
        inReplyTo: "a@x",
        rfcReferences: "a@x",
        subject: "Re: Invoice",
        createdAt: 2,
      },
    ]);
    const first = await getMessageFor(env, t.owner, l1, { images: false });
    expect(first.thread.map((x) => x.id)).toEqual([l2]);
    const reply = await getMessageFor(env, t.owner, l2, { images: false });
    expect(reply.thread.map((x) => x.id)).toEqual([l1]);

    const m = await memberOf(t.workspaceId, "thread-member@example.com", "member");
    await createAddressGrant(env, { workspaceId: t.workspaceId, addressId: in1, memberId: m.memberId });
    await expect(getMessageFor(env, m.actor, l1, { images: false })).resolves.toMatchObject({ thread: [] });
  });

  it("migration 4 adds the direction, reply and webhook-delivery indexes", async () => {
    const indexes = await runInDurableObject(clientFor(env, "migrate-index-check"), (_instance, state) =>
      state.storage.sql
        .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'")
        .toArray()
        .map((r) => r.name),
    );
    expect(indexes).toEqual(
      expect.arrayContaining(["message_direction_created", "message_in_reply_to", "webhook_delivery_webhook_created"]),
    );
  });
});

describe("letter HTML", () => {
  const HOSTILE =
    '<p>Hi</p><script>alert(1)</script><img src=x onerror=alert(2)><meta http-equiv="refresh" content="0;url=https://evil.example"><base href="https://evil.example/"><img src="https://track.example/p.gif">';

  it("strips script, handlers, meta and base, and blocks remote images unless they are shown", async () => {
    const t = await tenant("letter");
    const addr = await inbox(t.workspaceId, t.appA, "in@letter.test");
    const [id] = await seed(t.workspaceId, [
      { appId: t.appA, direction: "in", addressId: addr, rfcMessageId: "letter@x", fromEmail: "x@example.com", createdAt: 1 },
    ]);
    const htmlKey = `letter/${id}.html`;
    await env.MAIL.put(htmlKey, HOSTILE);
    await runInDurableObject(clientFor(env, t.workspaceId), (_instance, state) => {
      state.storage.sql.exec("UPDATE message SET html_key = ? WHERE id = ?", htmlKey, id);
    });

    const blocked = await getMessageFor(env, t.owner, id, { images: false });
    expect(blocked.htmlSafe).toContain("Hi");
    for (const bad of ["<script", "onerror", "http-equiv", "<base", "track.example"]) {
      expect(blocked.htmlSafe, bad).not.toContain(bad);
    }
    expect(blocked.blockedRemote).toBe(1);

    const shown = await getMessageFor(env, t.owner, id, { images: true });
    expect(shown.htmlSafe).toContain("track.example");
    expect(shown.htmlSafe).not.toContain("<script");
  });
});

describe("parseMessagesSearch", () => {
  it("drops unknown or garbage values and defaults dir to out", () => {
    expect(parseMessagesSearch({ dir: "sideways", status: "lost", cursor: 5 })).toEqual({ dir: "out" });
  });

  it("keeps the valid filters", () => {
    expect(
      parseMessagesSearch({ dir: "in", app: "app_1", status: "failed", email: " a@b.co ", cursor: "1700.msg_abcdefghijkl" }),
    ).toEqual({ dir: "in", app: "app_1", status: "failed", email: "a@b.co", cursor: "1700.msg_abcdefghijkl" });
  });
});
