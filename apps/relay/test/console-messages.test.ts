import { env, runInDurableObject, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { requireActor } from "../src/console/actor";
import { getMessageFor, listMessagesFor } from "../src/services/inbox";
import { createAddress, createAddressGrant } from "../src/core/addresses";
import { clientFor } from "../src/do/client";
import { securityDb } from "../src/db/security/client";
import { addressGrant, app, member, team, teamMember, user } from "../src/db/security/schema";
import { parseMessagesSearch } from "../src/components/messages/messages-search";
import { newId } from "../src/shared/ids";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
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
  return { workspaceId, appA: appA.id, appB: appB.id, owner, cookie: ownerCookie };
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
  return { actor, userId: u.id, memberId: m.id, cookie };
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

type Tenant = Awaited<ReturnType<typeof tenant>>;

// An inbound letter with R2 objects for its raw source, html and attachments; attachment keys follow inbound.ts.
async function storedLetter(
  t: Tenant,
  addressId: string,
  opts: { html?: string; attachments?: { filename: string; body: string | Uint8Array; contentId?: string; contentType?: string }[] } = {},
) {
  const [id] = await seed(t.workspaceId, [
    { appId: t.appA, direction: "in", addressId, rfcMessageId: `${newId("msg")}@x`, createdAt: 1 },
  ]);
  const ws = t.workspaceId;
  const htmlKey = `ws/${ws}/msg/${id}.html`;
  const rawKey = `ws/${ws}/raw/2026/11/${id}.eml`;
  await env.MAIL.put(htmlKey, opts.html ?? "<p>Hello</p>");
  await env.MAIL.put(rawKey, "From: x@example.com\r\n\r\nbody");
  const files = (opts.attachments ?? []).map((f, position) => ({
    ...f,
    id: newId("att"),
    position,
    key: `ws/${ws}/att/${id}/${position}-${f.filename}`,
  }));
  for (const f of files) await env.MAIL.put(f.key, f.body);
  await runInDurableObject(clientFor(env, ws), (_instance, state) => {
    state.storage.sql.exec("UPDATE message SET html_key = ?, raw_key = ? WHERE id = ?", htmlKey, rawKey, id);
    for (const f of files) {
      state.storage.sql.exec(
        "INSERT INTO attachment (id, message_id, app_id, position, filename, content_type, size_bytes, content_id, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
        f.id,
        id,
        t.appA,
        f.position,
        f.filename,
        f.contentType ?? "application/pdf",
        f.body.length,
        f.contentId ?? null,
        f.key,
      );
    }
  });
  return { id, htmlKey, rawKey, attIds: files.map((f) => f.id), attKeys: files.map((f) => f.key) };
}

describe("downloads", () => {
  const PDF = "%PDF-1.4 stored bytes";

  it("streams an attachment, the html and the raw letter as sandboxed octet streams", async () => {
    const t = await tenant("dl-owner");
    const addr = await inbox(t.workspaceId, t.appA, "in@dl.test");
    const letter = await storedLetter(t, addr, { attachments: [{ filename: "invoice.pdf", body: PDF }] });

    const att = await SELF.fetch(`${ORIGIN}/api/console/messages/${letter.id}/${letter.attIds[0]}`, {
      headers: { cookie: t.cookie },
    });
    expect(att.status).toBe(200);
    expect(att.headers.get("content-type")).toBe("application/octet-stream");
    expect(att.headers.get("content-disposition")).toBe('attachment; filename="invoice.pdf"');
    expect(att.headers.get("content-security-policy")).toContain("sandbox");
    expect(att.headers.get("x-content-type-options")).toBe("nosniff");
    expect(att.headers.get("cache-control")).toBe("private, no-store");
    expect(att.headers.get("content-length")).toBe(String(PDF.length));
    expect(await att.text()).toBe(PDF);

    const html = await SELF.fetch(`${ORIGIN}/api/console/messages/${letter.id}/html`, { headers: { cookie: t.cookie } });
    expect(html.status).toBe(200);
    expect(html.headers.get("content-disposition")).toBe(`attachment; filename="${letter.id}.html"`);
    expect(await html.text()).toBe("<p>Hello</p>");

    const raw = await SELF.fetch(`${ORIGIN}/api/console/messages/${letter.id}/raw`, { headers: { cookie: t.cookie } });
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-disposition")).toBe(`attachment; filename="${letter.id}.eml"`);
    expect(await raw.text()).toBe("From: x@example.com\r\n\r\nbody");
  });

  it("sanitises a hostile attachment filename before it reaches the header", async () => {
    const t = await tenant("dl-hostile");
    const addr = await inbox(t.workspaceId, t.appA, "in@hostile.test");
    const letter = await storedLetter(t, addr, { attachments: [{ filename: 'a"b‮.pdf', body: PDF }] });
    const res = await SELF.fetch(`${ORIGIN}/api/console/messages/${letter.id}/${letter.attIds[0]}`, {
      headers: { cookie: t.cookie },
    });
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="ab.pdf"');
  });

  it("shows the same sanitised attachment name in the detail view as the download", async () => {
    const t = await tenant("dl-label");
    const addr = await inbox(t.workspaceId, t.appA, "in@label.test");
    const letter = await storedLetter(t, addr, { attachments: [{ filename: "invoice‮gnp.exe", body: PDF }] });
    const detail = await getMessageFor(env, t.owner, letter.id, { images: false });
    expect(detail.attachments[0].filename).toBe("invoicegnp.exe");
  });

  it("falls through to the download for an empty attachment asked to preview", async () => {
    const t = await tenant("dl-empty");
    const addr = await inbox(t.workspaceId, t.appA, "in@empty.test");
    const letter = await storedLetter(t, addr, { attachments: [{ filename: "empty.txt", body: "", contentType: "text/plain" }] });
    const res = await SELF.fetch(`${ORIGIN}/api/console/messages/${letter.id}/${letter.attIds[0]}?view=1`, {
      headers: { cookie: t.cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("has no raw route for an outbound letter", async () => {
    const t = await tenant("dl-out");
    const [outId] = await seed(t.workspaceId, [{ appId: t.appA, direction: "out", toEmail: "c@example.com", createdAt: 1 }]);
    const res = await SELF.fetch(`${ORIGIN}/api/console/messages/${outId}/raw`, { headers: { cookie: t.cookie } });
    expect(res.status).toBe(404);
  });

  it("404s for a member with no grant, and serves once a grant exists", async () => {
    const t = await tenant("dl-grant");
    const addr = await inbox(t.workspaceId, t.appA, "in@dl-grant.test");
    const letter = await storedLetter(t, addr, { attachments: [{ filename: "a.pdf", body: PDF }] });
    const paths = [`/${letter.id}/html`, `/${letter.id}/raw`, `/${letter.id}/${letter.attIds[0]}`];
    const m = await memberOf(t.workspaceId, "dl-member@example.com", "member");

    for (const path of paths) {
      const res = await SELF.fetch(`${ORIGIN}/api/console/messages${path}`, { headers: { cookie: m.cookie } });
      expect(res.status, path).toBe(404);
    }

    await createAddressGrant(env, { workspaceId: t.workspaceId, addressId: addr, memberId: m.memberId });
    for (const path of paths) {
      const res = await SELF.fetch(`${ORIGIN}/api/console/messages${path}`, { headers: { cookie: m.cookie } });
      expect(res.status, path).toBe(200);
    }
  });

  it("404s for another workspace's letter, and for an attachment of a different letter", async () => {
    const t = await tenant("dl-iso");
    const addr = await inbox(t.workspaceId, t.appA, "in@dl-iso.test");
    const letter = await storedLetter(t, addr, { attachments: [{ filename: "a.pdf", body: PDF }] });
    const other = await storedLetter(t, addr, { attachments: [{ filename: "b.pdf", body: PDF }] });
    const otherTenant = await tenant("dl-iso-other");

    const foreign = await SELF.fetch(`${ORIGIN}/api/console/messages/${letter.id}/${letter.attIds[0]}`, {
      headers: { cookie: otherTenant.cookie },
    });
    expect(foreign.status).toBe(404);

    const mismatched = await SELF.fetch(`${ORIGIN}/api/console/messages/${letter.id}/${other.attIds[0]}`, {
      headers: { cookie: t.cookie },
    });
    expect(mismatched.status).toBe(404);
  });

  it("answers 401 without a session", async () => {
    const t = await tenant("dl-anon");
    const addr = await inbox(t.workspaceId, t.appA, "in@dl-anon.test");
    const letter = await storedLetter(t, addr);
    const res = await SELF.fetch(`${ORIGIN}/api/console/messages/${letter.id}/html`);
    expect(res.status).toBe(401);
  });

  it("404s, not 500, when the stored object has been deleted", async () => {
    const t = await tenant("dl-gone");
    const addr = await inbox(t.workspaceId, t.appA, "in@dl-gone.test");
    const letter = await storedLetter(t, addr, { attachments: [{ filename: "a.pdf", body: PDF }] });
    await env.MAIL.delete(letter.attKeys[0]);
    const res = await SELF.fetch(`${ORIGIN}/api/console/messages/${letter.id}/${letter.attIds[0]}`, {
      headers: { cookie: t.cookie },
    });
    expect(res.status).toBe(404);
  });

  it("HEAD on a raw letter never returns a body, and a hidden letter answers like a missing one", async () => {
    const t = await tenant("dl-head");
    const addr = await inbox(t.workspaceId, t.appA, "in@dl-head.test");
    const letter = await storedLetter(t, addr);
    const m = await memberOf(t.workspaceId, "dl-head-member@example.com", "member");
    const hidden = await SELF.fetch(`${ORIGIN}/api/console/messages/${letter.id}/raw`, {
      method: "HEAD",
      headers: { cookie: m.cookie },
    });
    const missing = await SELF.fetch(`${ORIGIN}/api/console/messages/${newId("msg")}/raw`, {
      method: "HEAD",
      headers: { cookie: m.cookie },
    });
    expect(hidden.status).toBe(missing.status);
    expect(await hidden.text()).toBe("");
    if (hidden.status === 200) expect(hidden.headers.get("content-disposition")).toContain("attachment");
  });
});

describe("attachment previews", () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
  const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
  const PDF_CSP = "default-src 'none'; object-src 'none'; frame-ancestors 'none'";
  const view = (cookie: string, id: string, part: string) =>
    SELF.fetch(`${ORIGIN}/api/console/messages/${id}/${part}?view=1`, { headers: { cookie } });

  it("serves sniffed image and PDF bytes inline with the sniffed type, whatever the stored type says", async () => {
    const t = await tenant("pv-bytes");
    const addr = await inbox(t.workspaceId, t.appA, "in@pv-bytes.test");
    const letter = await storedLetter(t, addr, {
      attachments: [
        { filename: "a.png", body: PNG, contentType: "application/octet-stream" },
        { filename: "b.jpg", body: JPEG, contentType: "image/png" },
        { filename: "c.gif", body: "GIF89a\u0001\u0000", contentType: "image/gif" },
        { filename: "d.webp", body: "RIFF\u0004\u0000\u0000\u0000WEBPVP8 ", contentType: "image/webp" },
        { filename: "e.pdf", body: "%PDF-1.7 bytes", contentType: "application/pdf" },
      ],
    });
    const expected: [string, string][] = [
      ["a.png", "image/png"],
      ["b.jpg", "image/jpeg"],
      ["c.gif", "image/gif"],
      ["d.webp", "image/webp"],
      ["e.pdf", "application/pdf"],
    ];
    for (const [i, [filename, type]] of expected.entries()) {
      const res = await view(t.cookie, letter.id, letter.attIds[i]);
      expect(res.status, filename).toBe(200);
      expect(res.headers.get("content-type"), filename).toBe(type);
      expect(res.headers.get("content-disposition"), filename).toBe(`inline; filename="${filename}"`);
      expect(res.headers.get("content-security-policy"), filename).toBe(type === "application/pdf" ? PDF_CSP : "sandbox");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    const png = await view(t.cookie, letter.id, letter.attIds[0]);
    expect(new Uint8Array(await png.arrayBuffer())).toEqual(PNG);
  });

  it("serves text/plain as UTF-8 text under the sandbox", async () => {
    const t = await tenant("pv-text");
    const addr = await inbox(t.workspaceId, t.appA, "in@pv-text.test");
    const letter = await storedLetter(t, addr, {
      attachments: [{ filename: "notes.txt", body: "hello <b>there</b>", contentType: "text/plain" }],
    });
    const res = await view(t.cookie, letter.id, letter.attIds[0]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("content-security-policy")).toBe("sandbox");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="notes.txt"');
    expect(await res.text()).toBe("hello <b>there</b>");
  });

  it("downloads what it cannot preview: HTML labelled as an image, SVG, NUL text, and HTML as text", async () => {
    const t = await tenant("pv-download");
    const addr = await inbox(t.workspaceId, t.appA, "in@pv-download.test");
    const letter = await storedLetter(t, addr, {
      attachments: [
        { filename: "page.png", body: "<p>x</p>", contentType: "image/png" },
        { filename: "logo.svg", body: "<svg xmlns='http://www.w3.org/2000/svg'></svg>", contentType: "image/svg+xml" },
        { filename: "log.txt", body: "a\u0000b", contentType: "text/plain" },
        { filename: "page.txt", body: "<p>x</p>", contentType: "text/html" },
      ],
    });
    for (const [i, filename] of ["page.png", "logo.svg", "log.txt", "page.txt"].entries()) {
      const res = await view(t.cookie, letter.id, letter.attIds[i]);
      expect(res.status, filename).toBe(200);
      expect(res.headers.get("content-type"), filename).toBe("application/octet-stream");
      expect(res.headers.get("content-disposition"), filename).toBe(`attachment; filename="${filename}"`);
      expect(res.headers.get("content-security-policy"), filename).toBe("sandbox; default-src 'none'");
    }
  });

  it("sends ?view=1 on the html and raw letter to the download", async () => {
    const t = await tenant("pv-letter");
    const addr = await inbox(t.workspaceId, t.appA, "in@pv-letter.test");
    const letter = await storedLetter(t, addr, { html: "<p>Hello</p>" });
    const html = await view(t.cookie, letter.id, "html");
    expect(html.headers.get("content-type")).toBe("application/octet-stream");
    expect(html.headers.get("content-disposition")).toBe(`attachment; filename="${letter.id}.html"`);
    const raw = await view(t.cookie, letter.id, "raw");
    expect(raw.headers.get("content-type")).toBe("application/octet-stream");
    expect(raw.headers.get("content-disposition")).toBe(`attachment; filename="${letter.id}.eml"`);
  });

  it("404s a hidden or foreign preview exactly like a missing one", async () => {
    const t = await tenant("pv-hidden");
    const addr = await inbox(t.workspaceId, t.appA, "in@pv-hidden.test");
    const letter = await storedLetter(t, addr, { attachments: [{ filename: "a.png", body: PNG, contentType: "image/png" }] });
    const m = await memberOf(t.workspaceId, "pv-member@example.com", "member");
    const other = await tenant("pv-foreign");
    const hidden = await view(m.cookie, letter.id, letter.attIds[0]);
    const foreign = await view(other.cookie, letter.id, letter.attIds[0]);
    const missing = await view(m.cookie, newId("msg"), letter.attIds[0]);
    expect(hidden.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    const missingBody = await missing.text();
    expect(await hidden.text()).toBe(missingBody);
    expect(await foreign.text()).toBe(missingBody);
  });
});

describe("inline images", () => {
  const PNG = "PNGDATA";
  const KB = 1024;

  // Owner's view of a letter, with images shown or blocked.
  const view = (t: Tenant, id: string, images: boolean) => getMessageFor(env, t.owner, id, { images });

  it("inlines a PNG as a data: URI when images are shown, and drops it when blocked", async () => {
    const t = await tenant("img-png");
    const addr = await inbox(t.workspaceId, t.appA, "in@img-png.test");
    const letter = await storedLetter(t, addr, {
      html: '<p>Logo</p><img src="cid:logo@x">',
      attachments: [{ filename: "logo.png", body: PNG, contentId: "<logo@x>", contentType: "image/png" }],
    });
    const shown = await view(t, letter.id, true);
    expect(shown.htmlSafe).toContain(`src="data:image/png;base64,${btoa(PNG)}"`);
    const blocked = await view(t, letter.id, false);
    expect(blocked.htmlSafe).not.toContain("data:image");
    expect(blocked.htmlSafe).not.toContain("cid:");
  });

  it("counts a cid-only letter's inline image as blocked, so show-images has something to reveal", async () => {
    const t = await tenant("img-held");
    const addr = await inbox(t.workspaceId, t.appA, "in@img-held.test");
    const letter = await storedLetter(t, addr, {
      html: '<p>Sig</p><img src="cid:logo@x">',
      attachments: [{ filename: "logo.png", body: PNG, contentId: "<logo@x>", contentType: "image/png" }],
    });
    expect((await view(t, letter.id, false)).blockedRemote).toBe(1);
  });

  it("does not inline an SVG attachment", async () => {
    const t = await tenant("img-svg");
    const addr = await inbox(t.workspaceId, t.appA, "in@img-svg.test");
    const letter = await storedLetter(t, addr, {
      html: '<img src="cid:logo@x">',
      attachments: [{ filename: "logo.svg", body: "<svg/>", contentId: "<logo@x>", contentType: "image/svg+xml" }],
    });
    const shown = await view(t, letter.id, true);
    expect(shown.htmlSafe).not.toContain("data:");
    expect(shown.htmlSafe).not.toContain("cid:");
  });

  it("does not inline an image over 512 KB", async () => {
    const t = await tenant("img-big");
    const addr = await inbox(t.workspaceId, t.appA, "in@img-big.test");
    const letter = await storedLetter(t, addr, {
      html: '<img src="cid:big@x">',
      attachments: [{ filename: "big.png", body: "a".repeat(600 * KB), contentId: "<big@x>", contentType: "image/png" }],
    });
    const shown = await view(t, letter.id, true);
    expect(shown.htmlSafe).not.toContain("data:image/png");
  });

  it("stops inlining once the letter's images total 2 MB", async () => {
    const t = await tenant("img-budget");
    const addr = await inbox(t.workspaceId, t.appA, "in@img-budget.test");
    const five = Array.from({ length: 5 }, (_, i) => ({
      filename: `p${i}.png`,
      body: "a".repeat(500 * KB),
      contentId: `<p${i}@x>`,
      contentType: "image/png",
    }));
    const html = five.map((_, i) => `<img src="cid:p${i}@x">`).join("");
    const letter = await storedLetter(t, addr, { html, attachments: five });
    const get = vi.spyOn(env.MAIL, "get");
    const shown = await view(t, letter.id, true);
    const imageReads = get.mock.calls.filter(([key]) => String(key).includes("/att/")).length;
    get.mockRestore();
    expect((shown.htmlSafe ?? "").split("data:image/png;base64,").length - 1).toBe(4);
    expect(shown.htmlSafe).not.toContain("cid:");
    expect(imageReads).toBe(4);
  });

  it("does not inline another letter's attachment for the same content-id", async () => {
    const t = await tenant("img-other");
    const addr = await inbox(t.workspaceId, t.appA, "in@img-other.test");
    await storedLetter(t, addr, { attachments: [{ filename: "a.png", body: PNG, contentId: "<shared@x>", contentType: "image/png" }] });
    const letter = await storedLetter(t, addr, { html: '<img src="cid:shared@x">' });
    const shown = await view(t, letter.id, true);
    expect(shown.htmlSafe).not.toContain("data:");
  });
});

describe("parseMessagesSearch", () => {
  it("drops unknown or garbage values and defaults dir to out", () => {
    expect(parseMessagesSearch({ dir: "sideways", status: "lost", cursor: 5 })).toEqual({ dir: "out" });
  });

  it("keeps the valid filters", () => {
    expect(
      parseMessagesSearch({ dir: "in", appId: "app_1", status: "failed", email: " a@b.co ", cursor: "1700.msg_abcdefghijkl" }),
    ).toEqual({ dir: "in", appId: "app_1", status: "failed", email: "a@b.co", cursor: "1700.msg_abcdefghijkl" });
  });

  it("ignores the old app key", () => {
    expect(parseMessagesSearch({ app: "app_1" })).toEqual({ dir: "out" });
  });
});

describe("campaign message content", () => {
  const HTML = '<p>Hi {{contact.first_name}}</p><p>{{postal_address}}</p><a href="{{unsubscribe_url}}">Stop</a>';
  const TEXT = "Hi {{contact.first_name}} {{postal_address}} {{unsubscribe_url}}";

  // A campaign message as the Workflow writes it. A null campaignId or a campaign that was never inserted is a gone campaign.
  async function campaignLetter(t: Tenant, id: string, campaignId: string, campaignExists: boolean) {
    await runInDurableObject(clientFor(env, t.workspaceId), (_instance, state) => {
      if (campaignExists)
        state.storage.sql.exec(
          "INSERT INTO campaign (id, app_id, name, status, from_email, subject, html, text, postal_address, created_at, updated_at) VALUES (?, ?, 'C', 'sent', 'relay@a6n.ai', 'Hi', ?, ?, '1 Main St', 0, 0)",
          campaignId,
          t.appA,
          HTML,
          TEXT,
        );
      state.storage.sql.exec(
        "INSERT INTO message (id, app_id, direction, stream, status, event, campaign_id, from_email, from_name, ses_region, to_email, subject, merge_data, attempts, opens, clicks, created_at, updated_at) VALUES (?, ?, 'out', 'marketing', 'sent', 'campaign', ?, 'relay@a6n.ai', 'A', 'us-east-1', 'ann@x.com', 'Hi', ?, 1, 0, 0, 0, 0)",
        id,
        t.appA,
        campaignId,
        JSON.stringify({ email: "ann@x.com", firstName: "<b>Ann</b>", lastName: null }),
      );
    });
  }

  it("renders the escaped HTML and the text on read, and downloads the same HTML", async () => {
    const t = await tenant("camp-read");
    await campaignLetter(t, "msg_camp_read", "cmp_read", true);

    const view = await getMessageFor(env, t.owner, "msg_camp_read", { images: false });
    expect(view.htmlSafe).toContain("Hi &lt;b&gt;Ann&lt;/b&gt;");
    expect(view.htmlSafe).toContain("{{unsubscribe_url}}");
    expect(view.text).toBe("Hi <b>Ann</b> 1 Main St {{unsubscribe_url}}");

    const html = await SELF.fetch(`${ORIGIN}/api/console/messages/msg_camp_read/html`, { headers: { cookie: t.cookie } });
    expect(html.status).toBe(200);
    expect(html.headers.get("content-disposition")).toBe('attachment; filename="msg_camp_read.html"');
    expect(await html.text()).toBe('<p>Hi &lt;b&gt;Ann&lt;/b&gt;</p><p>1 Main St</p><a href="{{unsubscribe_url}}">Stop</a>');
  });

  it("shows no content and a 404 download when the campaign row is gone", async () => {
    const t = await tenant("camp-gone");
    await campaignLetter(t, "msg_camp_gone_read", "cmp_missing", false);

    const view = await getMessageFor(env, t.owner, "msg_camp_gone_read", { images: false });
    expect(view.htmlSafe).toBeNull();
    expect(view.text).toBeNull();
    const html = await SELF.fetch(`${ORIGIN}/api/console/messages/msg_camp_gone_read/html`, { headers: { cookie: t.cookie } });
    expect(html.status).toBe(404);
  });
});
