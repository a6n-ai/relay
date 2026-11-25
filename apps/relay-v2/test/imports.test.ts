import { createExecutionContext, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApiKey } from "../src/core/api-keys";
import { securityDb } from "../src/db/security/client";
import { app, member, user, workspace } from "../src/db/security/schema";
import { RelayRpc } from "../src/rpc/relay-rpc";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

async function seed(slug: string) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [owner] = await db.insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
  await db.insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
  const [a] = await db.insert(app).values({ workspaceId: ws.id, name: "one", slug: "one" }).returning();
  const key = (await createApiKey(env, { workspaceId: ws.id, appId: a.id, name: "k" })).secret;
  const [b] = await db.insert(app).values({ workspaceId: ws.id, name: "two", slug: "two" }).returning();
  const key2 = (await createApiKey(env, { workspaceId: ws.id, appId: b.id, name: "k2" })).secret;
  return { rpc: new RelayRpc(createExecutionContext(), env), key, key2 };
}

const listRow = (ref: string) => ({ importRef: ref, name: `List ${ref}`, consentSource: "import_other" as const });

describe("import_ref imports", () => {
  it("returns the same ids on a repeat import", async () => {
    const { rpc, key } = await seed("imp-lists");
    const first = await rpc.importLists(key, [listRow("r1"), listRow("r2")]);
    expect(first).toMatchObject({ created: 2, existing: 0 });
    const again = await rpc.importLists(key, [listRow("r1"), listRow("r2")]);
    expect(again).toMatchObject({ created: 0, existing: 2 });
    expect(again.ids).toEqual(first.ids);
  });

  it("scopes an import ref to its app, so another app gets its own row", async () => {
    const { rpc, key, key2 } = await seed("imp-cross-ref");
    const mine = await rpc.importLists(key, [listRow("shared")]);
    const theirs = await rpc.importLists(key2, [listRow("shared")]);
    expect(theirs).toMatchObject({ created: 1, existing: 0 });
    expect(theirs.ids.shared).not.toBe(mine.ids.shared);
    expect(await rpc.importLists(key, [listRow("shared")])).toMatchObject({ created: 0, existing: 1, ids: mine.ids });
  });

  it("refuses a campaign whose listIds name another app's list", async () => {
    const { rpc, key, key2 } = await seed("imp-cross-list");
    const { ids } = await rpc.importLists(key, [listRow("mine")]);
    const row = { importRef: "c3", name: "C", status: "draft", fromEmail: null, subject: "S", html: "", text: "", listIds: [ids.mine] };
    await expect(rpc.importCampaigns(key2, [row])).rejects.toThrow("unknown list");
  });

  it("refuses a campaign subject with a line break", async () => {
    const { rpc, key } = await seed("imp-subject");
    const row = { importRef: "c4", name: "C", status: "draft", fromEmail: null, subject: "a\nb", html: "", text: "", listIds: [] };
    await expect(rpc.importCampaigns(key, [row])).rejects.toThrow();
  });

  it("refuses a campaign whose status is scheduling", async () => {
    const { rpc, key } = await seed("imp-status");
    const row = { importRef: "c1", name: "C", status: "scheduling", fromEmail: null, subject: "", html: "", text: "", listIds: [] };
    await expect(rpc.importCampaigns(key, [row])).rejects.toThrow();
  });

  it("keeps a sent campaign's counters and never runs it", async () => {
    const { rpc, key } = await seed("imp-sent");
    const row = {
      importRef: "c2",
      name: "Sent one",
      status: "sent",
      fromEmail: null,
      subject: "S",
      html: "<p>x</p>",
      text: "x",
      listIds: [],
      counters: { sent: 5, queued: 0 },
    };
    const { ids } = await rpc.importCampaigns(key, [row]);
    const campaign = await rpc.getCampaign(key, ids.c2);
    expect(campaign.status).toBe("sent");
    expect(await rpc.campaignStats(key, ids.c2)).toMatchObject({ sent: 5 });
  });

  it("refuses more than 500 rows", async () => {
    const { rpc, key } = await seed("imp-big");
    const rows = Array.from({ length: 501 }, (_, i) => listRow(`big-${i}`));
    await expect(rpc.importLists(key, rows)).rejects.toThrow();
  });
});
