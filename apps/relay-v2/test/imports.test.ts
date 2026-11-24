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
  return { rpc: new RelayRpc(createExecutionContext(), env), key };
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
