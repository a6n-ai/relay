import { env, runInDurableObject, SELF } from "cloudflare:test";
import { and, eq, like } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireActor } from "../src/console/actor";
import { domainDeletePreview, deleteDomain } from "../src/console/domain-delete";
import { addAddress, addDomain, setDomainProtected } from "../src/console/domains";
import { createApp } from "../src/core/apps";
import { createAddressGrant } from "../src/core/addresses";
import { memorySesIdentity } from "../src/core/ses-identity";
import { coreDb } from "../src/db/core/client";
import { address, sendingDomain } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { addressGrant, member, securityAudit } from "../src/db/security/schema";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

const WRITE = { permission: { sending: ["write"] }, write: true };

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
      `INSERT INTO message (id, app_id, channel, direction, stream, status, from_email, to_email, created_at, updated_at, raw_key) VALUES ('msg_in', ?, 'email', 'in', 'transactional', 'sent', 'ext@other.test', ?, 1, 1, 'raw/${domain}-in')`,
      appId,
      `in@${domain}`,
    );
    sql.exec(
      "INSERT INTO attachment (id, message_id, app_id, position, filename, content_type, size_bytes, r2_key, created_at) VALUES ('att_1', 'msg_in', ?, 0, 'a.txt', 'text/plain', 1, ?, 1)",
      appId,
      `att/${domain}-1`,
    );
  });
  await env.MAIL.put(`raw/${domain}-in`, "raw");
  await env.MAIL.put(`att/${domain}-1`, "attachment");
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

    expect(await domainDeletePreview(env, actor, dom.id)).toMatchObject({
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
    expect(await env.MAIL.get("raw/del-a.test-in")).not.toBeNull();

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
    expect((await domainDeletePreview(env, actor, dom.id)).messages).toBe(152);

    await deleteDomain(env, actor, dom.id, { confirm: "del-b.test", deleteHistory: true });

    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM message WHERE from_email LIKE '%@del-b.test' OR to_email LIKE '%@del-b.test'")).toBe(0);
    expect(await doCount(workspaceId, "SELECT COUNT(*) AS n FROM attachment WHERE r2_key LIKE 'att/del-b.test%'")).toBe(0);
    expect(await env.MAIL.get("raw/del-b.test-in")).toBeNull();
    expect(await env.MAIL.get("att/del-b.test-1")).toBeNull();
    const [audit] = await auditFor("domain.delete", dom.id);
    expect(JSON.parse(audit.data ?? "{}")).toMatchObject({ historyDeleted: true });
  });

  it("keeps a protected domain's SES identity and returns the owner command instead", async () => {
    const { actor } = await adminActorFor("del-c@example.com", "Del C Co");
    const dom = await addDomain(env, actor, { domain: "del-c.test" });
    await setDomainProtected(env, actor, dom.id, true);
    const command = "aws sesv2 delete-email-identity --region ap-south-1 --email-identity del-c.test";
    expect(await domainDeletePreview(env, actor, dom.id)).toMatchObject({ protected: true, sesDelete: false, ownerCommand: command });

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

    await expect(domainDeletePreview(env, owner, dom.id)).rejects.toMatchObject({ status: 403 });
    await expect(deleteDomain(env, owner, dom.id, { confirm: "del-d.test", deleteHistory: false })).rejects.toMatchObject({ status: 403 });
    expect(await domainRow(dom.id)).toBeDefined();
  });
});
