import { createExecutionContext, env, runInDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { coreDb } from "../src/db/core/client";
import { address } from "../src/db/core/schema";
import { clientFor } from "../src/do/client";
import { createApiKey } from "../src/services/api-keys";
import { securityDb } from "../src/db/security/client";
import { app, member, user, workspace } from "../src/db/security/schema";
import { RelayRpc } from "../src/rpc/relay-rpc";
import { applyMigrations, seedVerifiedSender } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

async function seed(slug: string) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [owner] = await db.insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
  await db.insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
  const [app1] = await db.insert(app).values({ workspaceId: ws.id, name: "one", slug: "one" }).returning();
  const [app2] = await db.insert(app).values({ workspaceId: ws.id, name: "two", slug: "two" }).returning();
  const key1 = (await createApiKey(env, { workspaceId: ws.id, appId: app1.id, name: "k1" })).secret;
  const key2 = (await createApiKey(env, { workspaceId: ws.id, appId: app2.id, name: "k2" })).secret;
  return { rpc: new RelayRpc(createExecutionContext(), env), key1, key2, ws: ws.id, app1: app1.id, app2: app2.id };
}

describe("RelayRpc scope", () => {
  it("shows a list only to the app that created it", async () => {
    const { rpc, key1, key2 } = await seed("rpc-lists");
    const list = await rpc.createList(key1, { name: "Customers", consentSource: "express_optin" });
    expect((await rpc.listLists(key1)).map((l) => l.id)).toContain(list.id);
    expect((await rpc.listLists(key2)).map((l) => l.id)).not.toContain(list.id);
  });

  it("answers another app's ids as not found and changes nothing", async () => {
    const { rpc, key1, key2 } = await seed("rpc-cross");
    const list = await rpc.createList(key1, { name: "Mine", consentSource: "express_optin" });
    const member = await rpc.addMember(key1, list.id, { email: "a@x.test" });
    expect(member).toBe("added");
    const campaign = await rpc.createCampaign(key1, { name: "Mine" });
    const tpl = await rpc.createTemplate(key1, { name: "T", subject: "S", html: "<p>x</p>", text: "x" });
    await expect(rpc.getCampaign(key2, campaign.id)).rejects.toThrow("not found");
    await expect(rpc.updateTemplate(key2, tpl.id, { name: "Hijacked" })).rejects.toThrow("not found");
    await expect(rpc.removeMember(key2, list.id, "clm_missing")).rejects.toThrow("not found");
    expect((await rpc.getTemplate(key1, tpl.id)).name).toBe("T");
  });

  it("refuses a bad key as unauthorized", async () => {
    const { rpc } = await seed("rpc-bad-key");
    await expect(rpc.listLists("not-a-key")).rejects.toThrow("unauthorized");
  });

  it("lists only event templates as overrides", async () => {
    const { rpc, key1 } = await seed("rpc-overrides");
    await rpc.createTemplate(key1, { name: "Plain", subject: "S" });
    await rpc.createTemplate(key1, { name: "Welcome", event: "welcome", subject: "Hi" });
    const overrides = await rpc.templateOverrides(key1);
    expect(overrides.map((o) => o.event)).toEqual(["welcome"]);
  });

  it("drops an app id and campaign id injected into a template send", async () => {
    const { rpc, key1, key2, ws, app1, app2 } = await seed("rpc-send-strip");
    await seedVerifiedSender(ws, app1);
    const tpl = await rpc.createTemplate(key1, { name: "T", subject: "Hi", html: "<p>x</p>", text: "x" });
    const sent = await rpc.sendTemplate(key1, {
      stream: "transactional",
      from: "Relay@A6n.ai",
      to: "a@x.com",
      templateId: tpl.id,
      appId: app2,
      campaignId: "cmp_injected",
    });
    expect(sent).toMatchObject({ status: "queued" });
    expect(await rpc.getMessage(key1, sent.messageId)).not.toBeNull();
    expect(await rpc.getMessage(key2, sent.messageId)).toBeNull();
  });

  it("answers a personal mailbox letter as not found", async () => {
    const { rpc, key1, ws, app1 } = await seed("rpc-personal");
    const [row] = await coreDb(env)
      .insert(address)
      .values({ workspaceId: ws, appId: app1, email: "me@rpc-personal.test", kind: "personal", ownerUserId: "usr_x" })
      .returning();
    await runInDurableObject(clientFor(env, ws), (_i, state) => {
      state.storage.sql.exec(
        "INSERT INTO message (id, app_id, direction, stream, status, address_id, created_at, updated_at) VALUES ('msg_personal1', ?, 'in', 'transactional', 'sent', ?, 1, 1)",
        app1,
        row.id,
      );
      state.storage.sql.exec(
        "INSERT INTO message (id, app_id, direction, stream, status, address_id, created_at, updated_at) VALUES ('msg_shared001', ?, 'in', 'transactional', 'sent', 'adr_other', 1, 1)",
        app1,
      );
    });
    expect(await rpc.getMessage(key1, "msg_personal1")).toBeNull();
    expect(await rpc.getMessage(key1, "msg_shared001")).not.toBeNull();
  });

  it("refuses a campaign id with a bad campaign input", async () => {
    const { rpc, key1 } = await seed("rpc-input");
    await expect(rpc.createCampaign(key1, { name: "" })).rejects.toThrow();
  });
});

describe("RelayRpc app-audience campaigns", () => {
  it("creates a hook-audience campaign with its console link, and refuses to schedule it with no hook", async () => {
    const { rpc, key1, app1 } = await seed("rpc-audience");
    const created = await rpc.createCampaign(key1, { name: "Hook", audienceKind: "hook", audienceQuery: "group:grp_1" });
    expect(created).toMatchObject({
      audienceKind: "hook",
      audienceQuery: "group:grp_1",
      consoleUrl: `http://localhost/campaigns/${created.id}?appId=${app1}`,
    });
    await expect(rpc.scheduleCampaign(key1, created.id, Date.now() + 3_600_000)).rejects.toThrow("audience_hook_missing");
  });

  it("switches a list campaign to a hook audience over RPC", async () => {
    const { rpc, key1 } = await seed("rpc-audience-update");
    const campaign = await rpc.createCampaign(key1, { name: "Switch" });
    const updated = await rpc.updateCampaign(key1, campaign.id, { audienceKind: "hook", audienceQuery: "group:grp_2" });
    expect(updated).toMatchObject({ audienceKind: "hook", audienceQuery: "group:grp_2" });
    await expect(rpc.scheduleCampaign(key1, campaign.id, Date.now() + 3_600_000)).rejects.toThrow("audience_hook_missing");
  });
});

describe("RelayRpc send errors", () => {
  it("reports a marketing send without an unsubscribe link as a plain error", async () => {
    const { rpc, key1 } = await seed("rpc-unsub");
    await expect(
      rpc.send(key1, { stream: "marketing", from: "Relay@A6n.ai", to: "buyer@x.test", subject: "Sale", html: "<p>x</p>", text: "x" }),
    ).rejects.toThrow("unsubscribe link required");
  });
});
