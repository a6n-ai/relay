import { env, runInDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

const stubFor = (ws: string) => env.CLIENT.get(env.CLIENT.idFromName(ws));

describe("contact lists in the workspace DO", () => {
  it("creates a list and lists it with a zero member count", async () => {
    const ws = "ws_list_create";
    const stub = stubFor(ws);
    await stub.createList(ws, "app_1", { name: "VIP", consentSource: "express_optin" });
    expect(await stub.listLists(ws, "app_1")).toMatchObject([{ name: "VIP", consentSource: "express_optin", members: 0 }]);
  });

  it("stores the member address trimmed and lowercased, and a second add is existing", async () => {
    const ws = "ws_list_norm";
    const stub = stubFor(ws);
    const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "purchase" });
    expect(await stub.addMember(ws, list.id, { email: " Ann@X.com " })).toBe("added");
    expect(await stub.addMember(ws, list.id, { email: "ann@x.com" })).toBe("existing");
    const page = await stub.listMembers(ws, list.id);
    expect(page?.rows.map((r) => r.email)).toEqual(["ann@x.com"]);
  });

  it("refuses a suppressed address and adds no row", async () => {
    const ws = "ws_list_supp";
    const stub = stubFor(ws);
    const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "purchase" });
    await stub.addSuppression(ws, "s@x.com", "bounce");
    expect(await stub.addMember(ws, list.id, { email: "s@x.com" })).toBe("suppressed");
    expect((await stub.listMembers(ws, list.id))?.rows).toEqual([]);
  });

  it("shows a marketing-only suppression as suppressed and a transactional-only one as subscribed", async () => {
    const ws = "ws_list_scope";
    const stub = stubFor(ws);
    const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "purchase" });
    await stub.addMember(ws, list.id, { email: "m@x.com" });
    await stub.addMember(ws, list.id, { email: "t@x.com" });
    await stub.addSuppression(ws, "m@x.com", "manual", "marketing");
    await stub.addSuppression(ws, "t@x.com", "manual", "transactional");
    const states = Object.fromEntries((await stub.listMembers(ws, list.id))!.rows.map((r) => [r.email, r.state]));
    expect(states).toEqual({ "m@x.com": "suppressed", "t@x.com": "subscribed" });
  });

  it("refuses to delete a list a scheduled campaign names, and deletes a draft-only list with its members", async () => {
    const ws = "ws_list_delete";
    const stub = stubFor(ws);
    const inUse = await stub.createList(ws, "app_1", { name: "Busy", consentSource: "purchase" });
    const draft = await stub.createList(ws, "app_1", { name: "Draft", consentSource: "purchase" });
    await stub.addMember(ws, draft.id, { email: "d@x.com" });
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO campaign (id, app_id, name, list_ids, status, created_at, updated_at) VALUES ('cmp_scheduled001', 'app_1', 'C', ?, 'scheduled', 1, 1)",
        JSON.stringify([inUse.id]),
      );
    });
    expect(await stub.deleteList(ws, inUse.id)).toBe("in_use");
    expect(await stub.deleteList(ws, draft.id)).toBe("deleted");
    expect(await stub.deleteList(ws, draft.id)).toBe("missing");
    expect(await stub.listLists(ws)).toMatchObject([{ name: "Busy" }]);
    const orphans = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM contact_list_member WHERE list_id = ?", draft.id).one().n,
    );
    expect(orphans).toBe(0);
  });

  it("pages 120 members as 50, 50 and 20, and rejects a junk cursor", async () => {
    const ws = "ws_list_page";
    const stub = stubFor(ws);
    const list = await stub.createList(ws, "app_1", { name: "Big", consentSource: "import_other" });
    for (let i = 0; i < 120; i++) await stub.addMember(ws, list.id, { email: `m${String(i).padStart(3, "0")}@x.com` });
    const sizes: number[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    let last: { nextCursor: string | null } | undefined;
    do {
      const page = await stub.listMembers(ws, list.id, cursor);
      sizes.push(page!.rows.length);
      page!.rows.forEach((r) => seen.add(r.email));
      last = page!;
      cursor = page!.nextCursor ?? undefined;
    } while (cursor);
    expect(sizes).toEqual([50, 50, 20]);
    expect(seen.size).toBe(120);
    expect(last?.nextCursor).toBeNull();
    const cursorError = await runInDurableObject(stub, async (instance) => {
      try {
        await instance.listMembers(ws, list.id, "junk");
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    });
    expect(cursorError).toBe("invalid cursor");
  });

  it("imports 250 rows across three chunks, and a re-run adds none", async () => {
    const ws = "ws_list_import";
    const stub = stubFor(ws);
    const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "import_other" });
    const rows = Array.from({ length: 250 }, (_, i) => ({ email: `i${i}@x.com` }));
    expect(await stub.importMembers(ws, list.id, rows)).toEqual({ added: 250, existing: 0, suppressed: 0 });
    expect(await stub.importMembers(ws, list.id, rows)).toEqual({ added: 0, existing: 250, suppressed: 0 });
  });

  it("leaves an existing member unchanged on re-import", async () => {
    const ws = "ws_list_keep";
    const stub = stubFor(ws);
    const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "purchase" });
    await stub.addMember(ws, list.id, { email: "keep@x.com", firstName: "Original", consentAt: 1_000 });
    await stub.importMembers(ws, list.id, [{ email: "KEEP@x.com", firstName: "Changed", consentAt: 2_000 }]);
    const page = await stub.listMembers(ws, list.id);
    expect(page?.rows).toMatchObject([{ email: "keep@x.com", firstName: "Original", consentAt: 1_000, source: "manual" }]);
  });

  it("counts a suppressed address as suppressed and does not add it", async () => {
    const ws = "ws_list_import_supp";
    const stub = stubFor(ws);
    const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "import_other" });
    await stub.addSuppression(ws, "gone@x.com", "complaint");
    expect(await stub.importMembers(ws, list.id, [{ email: "gone@x.com" }, { email: "ok@x.com" }])).toEqual({
      added: 1,
      existing: 0,
      suppressed: 1,
    });
    expect((await stub.listMembers(ws, list.id))?.rows.map((r) => r.email)).toEqual(["ok@x.com"]);
  });

  it("returns null for a missing list", async () => {
    const ws = "ws_list_import_missing";
    expect(await stubFor(ws).importMembers(ws, "ctl_missing00000", [{ email: "a@x.com" }])).toBeNull();
  });
});
