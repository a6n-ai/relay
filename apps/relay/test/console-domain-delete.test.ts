import { env, runInDurableObject, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireActor } from "../src/console/actor";
import { previewDomainDelete, deleteDomain } from "../src/services/domain-delete";
import { addAddress, addDomain, setDomainProtected } from "../src/services/domains";
import { createApp } from "../src/core/apps";
import { createAddressGrant } from "../src/core/addresses";
import { memorySesIdentity } from "../src/core/ses-identity";
import { coreDb } from "../src/db/core/client";
import { address, sendingDomain } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { addressGrant, member, securityAudit } from "../src/db/security/schema";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

const WRITE = { permission: { sending: ["write"] }, write: true } as const;

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

async function adminActorFor(email: string, name: string) {
  const cookie = await cookieFor(email, "admin");
  const workspaceId = await createWorkspace(cookie, name);
  await setActive(cookie, workspaceId);
  return { workspaceId, actor: await requireActor(env, headersFor(cookie), WRITE) };
}

const stubFor = (workspaceId: string) => env.CLIENT.get(env.CLIENT.idFromName(workspaceId));

async function domainRow(id: string) {
  const [row] = await coreDb(env).select().from(sendingDomain).where(eq(sendingDomain.id, id));
  return row;
}

const key = (workspaceId: string, k: string) => `ws/${workspaceId}/${k}`;

// Mail for one domain: an outbound and an inbound message, an attachment, a live campaign and an automation.
async function seedMail(workspaceId: string, appId: string, domain: string, campaignId: string) {
  await runInDurableObject(stubFor(workspaceId), (_instance, state) => {
    const sql = state.storage.sql;
    sql.exec(
      "UPDATE campaign SET from_email = ?, status = 'scheduled' WHERE id = ?",
      `hi@${domain}`,
      campaignId,
    );
    sql.exec(
      "INSERT INTO automation (id, app_id, name, list_id, template_id, from_email, delay_hours, enabled, created_at, updated_at) VALUES ('aut_1', ?, 'Welcome', 'lst_1', 'tpl_1', ?, 0, 1, 1, 1)",
      appId,
      `hi@${domain}`,
    );
    sql.exec(
      "INSERT INTO message (id, app_id, channel, direction, stream, status, from_email, to_email, created_at, updated_at) VALUES ('msg_out', ?, 'email', 'out', 'transactional', 'sent', ?, 'to@ext.test', 1, 1)",
      appId,
      `hi@${domain}`,
    );
    sql.exec(
      `INSERT INTO message (id, app_id, channel, direction, stream, status, from_email, to_email, created_at, updated_at, raw_key) VALUES ('msg_in', ?, 'email', 'in', 'transactional', 'sent', 'ext@other.test', ?, 1, 1, '${key(workspaceId, `raw/${domain}-in`)}')`,
      appId,
      `in@${domain}`,
    );
    sql.exec(
      "INSERT INTO attachment (id, message_id, app_id, position, filename, content_type, size_bytes, r2_key, created_at) VALUES ('att_1', 'msg_in', ?, 0, 'a.txt', 'text/plain', 1, ?, 1)",
      appId,
      key(workspaceId, `att/${domain}-1`),
    );
  });
  await env.MAIL.put(key(workspaceId, `raw/${domain}-in`), "raw");
  await env.MAIL.put(key(workspaceId, `att/${domain}-1`), "attachment");
}

async function doCount(workspaceId: string, sqlText: string, ...params: string[]): Promise<number> {
  return runInDurableObject(stubFor(workspaceId), (_instance, state) => state.storage.sql.exec<{ n: number }>(sqlText, ...params).one().n);
}

async function auditFor(action: string, target: string) {
  return securityDb(env)
    .select({ data: securityAudit.data })
    .from(securityAudit)
    .where(and(eq(securityAudit.action, action), eq(securityAudit.target, target)));
}

describe("sending domain delete", { timeout: 60_000 }, () => {
  it("previews the counts, then removes addresses, grants and routing and pauses senders, keeping mail history", async () => {
    const { workspaceId, actor } = await adminActorFor("del-a@example.com", "Del A Co");
    const { id: appId } = await createApp(env, { workspaceId, name: "Web", slug: "web" });
    const dom = await addDomain(env, actor, { domain: "del-a.test" });
    const sender = await addAddress(env, actor, { appId, email: "hi@del-a.test", kind: "sender" });
    const inbox = await addAddress(env, actor, { appId, email: "in@del-a.test", kind: "inbox" });
    const [mem] = await securityDb(env).select({ id: member.id }).from(member).where(eq(member.organizationId, workspaceId));
    await createAddressGrant(env, { workspaceId, addressId: sender.id, memberId: mem.id });
    const { id: campaignId } = (await stubFor(workspaceId).createCampaign(workspaceId, appId, "Spring")) as { id: string };
    await seedMail(workspaceId, appId, "del-a.test", campaignId);

    expect(await previewDomainDelete(env, actor, dom.id)).toMatchObject({
      addresses: { total: 2, senders: 1, inboxes: 1 },
      grants: 1,
      campaigns: 1,
      automations: 1,
      messages: 2,
      sesDelete: true,
      ownerCommand: null,
    });

    await expect(deleteDomain(env, actor, dom.id, { confirm: "del-a.example", deleteHistory: false })).rejects.toMatchObject({ status: 400 });
    expect(await domainRow(dom.id)).toBeDefined();

    expect(await deleteDomain(env, actor, dom.id, { confirm: "del-a.test", deleteHistory: false })).toEqual({ ownerCommand: null });
    expect(await domainRow(dom.id)).toBeUndefined();
    expect(await memorySesIdentity.get("ap-south-1", "del-a.test")).toBeNull();
    expect(await coreDb(env).select().from(address).where(eq(address.id, sender.id))).toHaveLength(0);
    expect(await coreDb(env).select().from(address).where(eq(address.id, inbox.id))).toHaveLength(0);
    expect(await securityDb(env).select().from(addressGrant).where(eq(addressGrant.addressId, sender.id))).toHaveLength(0);

    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM campaign WHERE id = ? AND status = 'paused' AND from_email IS NULL", campaignId)).toBe(1);
    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM automation WHERE id = 'aut_1' AND enabled = 0 AND from_email = ''")).toBe(1);
    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM message WHERE from_email LIKE '%@del-a.test' OR to_email LIKE '%@del-a.test'")).toBe(2);
    expect(await env.MAIL.get(key(workspaceId, "raw/del-a.test-in"))).not.toBeNull();

    const [audit] = await auditFor("domain.delete", dom.id);
    expect(audit.data).not.toContain("@");
    expect(JSON.parse(audit.data ?? "{}")).toMatchObject({ historyDeleted: false });
  });

  it("deletes mail history and its R2 objects in batches when the box is ticked", async () => {
    const { workspaceId, actor } = await adminActorFor("del-b@example.com", "Del B Co");
    const { id: appId } = await createApp(env, { workspaceId, name: "Web", slug: "web" });
    const dom = await addDomain(env, actor, { domain: "del-b.test" });
    const { id: campaignId } = (await stubFor(workspaceId).createCampaign(workspaceId, appId, "Bulk")) as { id: string };
    await seedMail(workspaceId, appId, "del-b.test", campaignId);
    await runInDurableObject(stubFor(workspaceId), (_instance, state) => {
      for (let i = 0; i < 150; i++) {
        state.storage.sql.exec(
          "INSERT INTO message (id, app_id, channel, direction, stream, status, from_email, to_email, created_at, updated_at) VALUES (?, ?, 'email', 'out', 'transactional', 'sent', 'hi@del-b.test', 'to@ext.test', 1, 1)",
          `msg_bulk_${i}`,
          appId,
        );
      }
    });
    expect((await previewDomainDelete(env, actor, dom.id)).messages).toBe(152);

    await deleteDomain(env, actor, dom.id, { confirm: "del-b.test", deleteHistory: true });

    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM message WHERE from_email LIKE '%@del-b.test' OR to_email LIKE '%@del-b.test'")).toBe(0);
    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM attachment WHERE r2_key LIKE '%att/del-b.test%'")).toBe(0);
    expect(await env.MAIL.get(key(workspaceId, "raw/del-b.test-in"))).toBeNull();
    expect(await env.MAIL.get(key(workspaceId, "att/del-b.test-1"))).toBeNull();
    const [audit] = await auditFor("domain.delete", dom.id);
    expect(JSON.parse(audit.data ?? "{}")).toMatchObject({ historyDeleted: true });
  });

  it("keeps a protected domain's SES identity and returns the owner command instead", async () => {
    const { actor } = await adminActorFor("del-c@example.com", "Del C Co");
    const dom = await addDomain(env, actor, { domain: "del-c.test" });
    await setDomainProtected(env, actor, dom.id, true);
    const command = "aws sesv2 delete-email-identity --region ap-south-1 --email-identity del-c.test";
    expect(await previewDomainDelete(env, actor, dom.id)).toMatchObject({ protected: true, sesDelete: false, ownerCommand: command });

    const sesDelete = vi.spyOn(memorySesIdentity, "delete");
    expect(await deleteDomain(env, actor, dom.id, { confirm: "del-c.test", deleteHistory: false })).toEqual({ ownerCommand: command });
    expect(sesDelete).not.toHaveBeenCalled();
    expect(await memorySesIdentity.get("ap-south-1", "del-c.test")).not.toBeNull();
    expect(await domainRow(dom.id)).toBeUndefined();
    expect(await auditFor("domain.delete_protected", dom.id)).toHaveLength(1);
  });

  it("refuses preview and delete for a workspace owner", async () => {
    const { workspaceId, actor } = await adminActorFor("del-d@example.com", "Del D Co");
    const dom = await addDomain(env, actor, { domain: "del-d.test" });
    const ownerCookie = await addMember(workspaceId, "del-owner@example.com", "owner");
    const owner = await requireActor(env, headersFor(ownerCookie), WRITE);

    await expect(previewDomainDelete(env, owner, dom.id)).rejects.toMatchObject({ status: 403 });
    await expect(deleteDomain(env, owner, dom.id, { confirm: "del-d.test", deleteHistory: false })).rejects.toMatchObject({ status: 403 });
    expect(await domainRow(dom.id)).toBeDefined();
  });

  it("deletes history only for the domain's own mail, with its webhook rows and failed letters, and guards R2 keys", async () => {
    const { workspaceId, actor } = await adminActorFor("del-e@example.com", "Del E Co");
    const { id: appId } = await createApp(env, { workspaceId, name: "Web", slug: "web" });
    const dom = await addDomain(env, actor, { domain: "del-e.test" });
    const raw = (name: string) => key(workspaceId, `raw/${name}`);
    await runInDurableObject(stubFor(workspaceId), (_instance, state) => {
      const sql = state.storage.sql;
      const msg = (id: string, direction: string, from: string, to: string, rawKey: string | null, htmlKey: string | null = null) =>
        sql.exec(
          "INSERT INTO message (id, app_id, channel, direction, stream, status, from_email, to_email, created_at, updated_at, raw_key, html_key) VALUES (?, ?, 'email', ?, 'transactional', 'sent', ?, ?, 1, 1, ?, ?)",
          id, appId, direction, from, to, rawKey, htmlKey,
        );
      msg("m_out", "out", "hi@del-e.test", "x@ext.test", null, key(workspaceId, "html/out"));
      msg("m_in", "in", "x@ext.test", "in@del-e.test", raw("shared"));
      msg("m_from", "in", "hi@del-e.test", "other@else.test", raw("kept"));
      msg("m_off", "out", "hi@del-e.test", "y@ext.test", null, "other-ws/html/off");
      sql.exec(
        "INSERT INTO webhook_delivery (id, webhook_id, app_id, message_id, event, payload_key, status, next_attempt_at, created_at, updated_at) VALUES ('whd_1', 'whk_1', ?, 'm_out', 'sent', ?, 'sent', 1, 1, 1), ('whd_2', 'whk_1', ?, 'm_from', 'sent', ?, 'sent', 1, 1, 1)",
        appId, key(workspaceId, "payload/1"), appId, key(workspaceId, "payload/2"),
      );
      const failure = (id: string, rawKey: string, to: string) =>
        sql.exec(
          "INSERT INTO inbound_failure (id, raw_key, app_id, envelope_from, envelope_to, received_at, error, attempts, created_at, updated_at) VALUES (?, ?, ?, 'x@ext.test', ?, 1, 'boom', 1, 1, 1)",
          id, rawKey, appId, to,
        );
      failure("ibf_dom", raw("shared"), "in@del-e.test");
      failure("ibf_dom2", raw("failed"), "in@del-e.test");
      failure("ibf_else", raw("else"), "z@else.test");
    });
    for (const k of ["html/out", "payload/1", "payload/2", "raw/shared", "raw/kept", "raw/failed", "raw/else"]) await env.MAIL.put(key(workspaceId, k), "x");
    await env.MAIL.put("other-ws/html/off", "x");

    await deleteDomain(env, actor, dom.id, { confirm: "del-e.test", deleteHistory: true });

    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM message WHERE id IN ('m_out', 'm_in', 'm_off')")).toBe(0);
    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM message WHERE id = 'm_from'")).toBe(1);
    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM webhook_delivery WHERE id = 'whd_1'")).toBe(0);
    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM webhook_delivery WHERE id = 'whd_2'")).toBe(1);
    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM inbound_failure WHERE id IN ('ibf_dom', 'ibf_dom2')")).toBe(0);
    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM inbound_failure WHERE id = 'ibf_else'")).toBe(1);
    for (const k of ["html/out", "payload/1", "raw/shared", "raw/failed"]) expect(await env.MAIL.get(key(workspaceId, k))).toBeNull();
    for (const k of ["payload/2", "raw/kept", "raw/else"]) expect(await env.MAIL.get(key(workspaceId, k))).not.toBeNull();
    expect(await env.MAIL.get("other-ws/html/off")).not.toBeNull();
  });

  it("keeps a raw letter while a failed-inbound row for another address still references it", async () => {
    const { workspaceId, actor } = await adminActorFor("del-f@example.com", "Del F Co");
    const { id: appId } = await createApp(env, { workspaceId, name: "Web", slug: "web" });
    const dom = await addDomain(env, actor, { domain: "del-f.test" });
    await runInDurableObject(stubFor(workspaceId), (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec(
        "INSERT INTO message (id, app_id, channel, direction, stream, status, from_email, to_email, created_at, updated_at, raw_key) VALUES ('m_a', ?, 'email', 'in', 'transactional', 'sent', 'x@ext.test', 'in@del-f.test', 1, 1, ?)",
        appId, key(workspaceId, "raw/both"),
      );
      sql.exec(
        "INSERT INTO inbound_failure (id, raw_key, app_id, envelope_from, envelope_to, received_at, error, attempts, created_at, updated_at) VALUES ('ibf_x', ?, ?, 'x@ext.test', 'z@else.test', 1, 'boom', 1, 1, 1)",
        key(workspaceId, "raw/both"), appId,
      );
    });
    await env.MAIL.put(key(workspaceId, "raw/both"), "x");
    await deleteDomain(env, actor, dom.id, { confirm: "del-f.test", deleteHistory: true });
    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM message WHERE id = 'm_a'")).toBe(0);
    expect(await env.MAIL.get(key(workspaceId, "raw/both"))).not.toBeNull();
  });

  it("aborts before touching D1, the DO or R2 when the SES delete fails, and a retry then succeeds", async () => {
    const { workspaceId, actor } = await adminActorFor("del-g@example.com", "Del G Co");
    const { id: appId } = await createApp(env, { workspaceId, name: "Web", slug: "web" });
    const dom = await addDomain(env, actor, { domain: "del-g.test" });
    const sender = await addAddress(env, actor, { appId, email: "hi@del-g.test", kind: "sender" });
    const { id: campaignId } = (await stubFor(workspaceId).createCampaign(workspaceId, appId, "Keep")) as { id: string };
    await seedMail(workspaceId, appId, "del-g.test", campaignId);

    vi.spyOn(memorySesIdentity, "delete").mockRejectedValueOnce(new Error("ses 500"));
    await expect(deleteDomain(env, actor, dom.id, { confirm: "del-g.test", deleteHistory: true })).rejects.toThrow("ses 500");
    expect(await domainRow(dom.id)).toBeDefined();
    expect(await coreDb(env).select().from(address).where(eq(address.id, sender.id))).toHaveLength(1);
    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM message WHERE from_email LIKE '%@del-g.test'")).toBeGreaterThan(0);
    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM campaign WHERE id = ? AND status = 'scheduled'", campaignId)).toBe(1);
    expect(await env.MAIL.get(key(workspaceId, "raw/del-g.test-in"))).not.toBeNull();
    expect(await auditFor("domain.delete", dom.id)).toHaveLength(0);

    await deleteDomain(env, actor, dom.id, { confirm: "del-g.test", deleteHistory: true });
    expect(await domainRow(dom.id)).toBeUndefined();
  });
});
