import { env, runInDurableObject } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { coreDb } from "../src/db/core/client";
import { workspaceProfile } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { workspace } from "../src/db/security/schema";
import { applyMigrations, seedVerifiedSender } from "./migrate";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const FROM = "relay@a6n.ai";

const stubFor = (ws: string) => env.CLIENT.get(env.CLIENT.idFromName(ws));

async function seededStub(ws: string) {
  await securityDb(env).insert(workspace).values({ id: ws, name: ws, slug: ws });
  await seedVerifiedSender(ws);
  const stub = stubFor(ws);
  await stub.ping(ws);
  // Runs re-check readiness against the workspace postal address, so it must be on the profile (created by the first limits load).
  await stub.refreshLimits(ws);
  await coreDb(env).update(workspaceProfile).set({ physicalAddress: "1 Main St" }).where(eq(workspaceProfile.workspaceId, ws));
  await stub.refreshLimits(ws);
  return stub;
}

const TEMPLATE = {
  name: "Welcome",
  subject: "Hi {{contact.first_name}}",
  html: '<p>Hi {{contact.first_name}}</p><p>{{postal_address}}</p><a href="{{unsubscribe_url}}">Stop</a>',
  text: "Hi {{contact.first_name}} {{postal_address}} {{unsubscribe_url}}",
};

async function setup(ws: string, consentSource: "express_optin" | "purchase" = "express_optin", delayHours = 2) {
  const stub = await seededStub(ws);
  const tpl = (await stub.createTemplate(ws, "app_1", TEMPLATE)) as { id: string };
  const list = await stub.createList(ws, "app_1", { name: "Welcome list", consentSource });
  const aut = await stub.createAutomation(ws, "app_1", {
    name: "Welcome",
    listId: list.id,
    templateId: tpl.id,
    fromEmail: FROM,
    delayHours,
  });
  return { stub, list, aut, tpl };
}

const runs = (stub: ReturnType<typeof stubFor>) =>
  runInDurableObject(stub, (_i, state) =>
    state.storage.sql
      .exec<{ email: string; status: string; due_at: number; error: string | null }>(
        "SELECT email, status, due_at, error FROM automation_run ORDER BY email",
      )
      .toArray(),
  );

const automationMessages = (stub: ReturnType<typeof stubFor>) =>
  runInDurableObject(stub, (_i, state) =>
    state.storage.sql
      .exec<{ email: string; status: string; key: string }>(
        "SELECT to_email AS email, status, idempotency_key AS key FROM message WHERE event = 'automation' ORDER BY to_email",
      )
      .toArray(),
  );

let sendSpy: MockInstance<typeof env.SEND.send>;

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(() => {
  sendSpy = vi.spyOn(env.SEND, "send").mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const refused = (call: Promise<unknown>) => call.then(() => "resolved", (e: Error) => e.message);

describe("list automations in the workspace DO", () => {
  it("refuses to enable without a postal address", async () => {
    const ws = "ws_aut_postal";
    const stub = await seededStub(ws);
    const tpl = (await stub.createTemplate(ws, "app_1", TEMPLATE)) as { id: string };
    const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "express_optin" });
    const aut = await stub.createAutomation(ws, "app_1", { name: "W", listId: list.id, templateId: tpl.id, fromEmail: FROM, delayHours: 0 });
    expect(aut.enabled).toBe(false);
    expect(await stub.setAutomationEnabled(ws, aut.id, true, null)).toEqual({ problems: ["postal_address_missing"] });
  });

  it("refuses to enable a template with {{data.*}} fields, which a list can never fill", async () => {
    const ws = "ws_aut_data";
    const stub = await seededStub(ws);
    const tpl = (await stub.createTemplate(ws, "app_1", { ...TEMPLATE, text: `${TEMPLATE.text} {{data.plan}}` })) as { id: string };
    const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "express_optin" });
    const aut = await stub.createAutomation(ws, "app_1", { name: "W", listId: list.id, templateId: tpl.id, fromEmail: FROM, delayHours: 0 });
    expect(await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St")).toEqual({ problems: ["data_fields_need_hook"] });
  });

  it("refuses a list or template from another app", async () => {
    const ws = "ws_aut_foreign";
    const { stub, list, tpl } = await setup(ws);
    expect(await refused(stub.createAutomation(ws, "app_2", { name: "X", listId: list.id, templateId: tpl.id, fromEmail: FROM, delayHours: 0 }))).toBe("unknown list");
    const other = (await stub.createTemplate(ws, "app_2", { ...TEMPLATE, name: "Other", event: null })) as { id: string };
    expect(await refused(stub.createAutomation(ws, "app_1", { name: "X", listId: list.id, templateId: other.id, fromEmail: FROM, delayHours: 0 }))).toBe("unknown template");
  });

  it("enrols an added member once, due after the delay, and lowers the alarm to it", async () => {
    const ws = "ws_aut_enrol";
    const { stub, list, aut } = await setup(ws);
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    const before = Date.now();
    expect(await stub.addMember(ws, list.id, { email: "a@x.com" })).toBe("added");
    const [run] = await runs(stub);
    expect(run).toMatchObject({ email: "a@x.com", status: "pending" });
    expect(run!.due_at).toBeGreaterThanOrEqual(before + 2 * HOUR);
    expect(run!.due_at).toBeLessThanOrEqual(Date.now() + 2 * HOUR);
    const alarm = await runInDurableObject(stub, (_i, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
    expect(alarm!).toBeLessThanOrEqual(run!.due_at);
  });

  it("creates no second run on a re-add or a re-import", async () => {
    const ws = "ws_aut_repeat";
    const { stub, list, aut } = await setup(ws);
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    await stub.addMember(ws, list.id, { email: "a@x.com" });
    expect(await stub.addMember(ws, list.id, { email: "a@x.com" })).toBe("existing");
    expect(await stub.importMembers(ws, list.id, [{ email: "a@x.com" }, { email: "b@x.com" }])).toEqual({
      added: 1,
      existing: 1,
      suppressed: 0,
    });
    expect((await runs(stub)).map((r) => r.email)).toEqual(["a@x.com", "b@x.com"]);
  });

  it("gives no run to a member added while the automation was disabled", async () => {
    const ws = "ws_aut_disabled";
    const { stub, list } = await setup(ws);
    await stub.addMember(ws, list.id, { email: "a@x.com" });
    expect(await runs(stub)).toEqual([]);
  });

  it("sends nothing before due, one marketing message at due, and nothing on a second pass", async () => {
    const ws = "ws_aut_due";
    const { stub, list, aut } = await setup(ws);
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    await stub.addMember(ws, list.id, { email: "a@x.com" });
    const [{ due_at: due }] = await runs(stub);
    expect(await stub.runDueAutomations(due - 1)).toMatchObject({ sent: 0, skipped: 0 });
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 1 });
    expect(await automationMessages(stub)).toEqual([{ email: "a@x.com", status: "queued", key: `automation:${aut.id}:a@x.com` }]);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 0 });
    expect(await automationMessages(stub)).toHaveLength(1);
    expect((await runs(stub))[0]).toMatchObject({ status: "sent" });
  });

  it("skips a member who left the list before due, with no message", async () => {
    const ws = "ws_aut_left";
    const { stub, list, aut } = await setup(ws);
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    await stub.addMember(ws, list.id, { email: "a@x.com" });
    const [member] = (await stub.listMembers(ws, list.id))!.rows;
    await stub.removeMember(ws, list.id, member!.id);
    const [{ due_at: due }] = await runs(stub);
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 0, skipped: 1 });
    expect(await runs(stub)).toEqual([expect.objectContaining({ status: "skipped", error: "left_list" })]);
    expect(await automationMessages(stub)).toEqual([]);
  });

  it("sends a suppressed row and no SES job for a member who opted out of the sender's brand", async () => {
    const ws = "ws_aut_optout";
    const { stub, list, aut } = await setup(ws);
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    await stub.addMember(ws, list.id, { email: "a@x.com" });
    await runInDurableObject(stub, (_i, state) => {
      state.storage.sql.exec("INSERT INTO marketing_optout (email, domain, created_at) VALUES ('a@x.com', 'a6n.ai', 1)");
    });
    const [{ due_at: due }] = await runs(stub);
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 1 });
    expect(await automationMessages(stub)).toEqual([expect.objectContaining({ email: "a@x.com", status: "suppressed" })]);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("skips one run whose subject renders blank, and still sends the others", async () => {
    const ws = "ws_aut_blank";
    const stub = await seededStub(ws);
    const tpl = (await stub.createTemplate(ws, "app_1", { ...TEMPLATE, subject: "{{contact.first_name}}" })) as { id: string };
    const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "express_optin" });
    const aut = await stub.createAutomation(ws, "app_1", { name: "W", listId: list.id, templateId: tpl.id, fromEmail: FROM, delayHours: 1 });
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    await stub.addMember(ws, list.id, { email: "a@x.com" });
    await stub.addMember(ws, list.id, { email: "b@x.com", firstName: "Bea" });
    const due = Math.max(...(await runs(stub)).map((r) => r.due_at));
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 1, skipped: 1, blocked: false });
    expect(await runs(stub)).toEqual([
      expect.objectContaining({ email: "a@x.com", status: "skipped", error: "empty_subject" }),
      expect.objectContaining({ email: "b@x.com", status: "sent" }),
    ]);
  });

  it("skips a purchase-sourced member whose consent is 731 days old", async () => {
    const ws = "ws_aut_lapsed";
    const { stub, list, aut } = await setup(ws, "purchase");
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    await stub.addMember(ws, list.id, { email: "a@x.com", consentAt: Date.now() - 731 * DAY });
    const [{ due_at: due }] = await runs(stub);
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 0, skipped: 1 });
    expect(await runs(stub)).toEqual([expect.objectContaining({ status: "skipped", error: "consent_lapsed" })]);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("takes at most 100 due runs per pass, so 150 need two", async () => {
    const ws = "ws_aut_batch";
    const { stub, list, aut } = await setup(ws, "express_optin", 1);
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    // The seeded profile starts with a small quota; 150 sends need room.
    await stub.refreshLimits(ws);
    await coreDb(env).update(workspaceProfile).set({ monthlyMessageQuota: 10000 }).where(eq(workspaceProfile.workspaceId, ws));
    await stub.refreshLimits(ws);
    const rows = Array.from({ length: 150 }, (_, i) => ({ email: `m${String(i).padStart(3, "0")}@x.com` }));
    await stub.importMembers(ws, list.id, rows);
    const due = Math.max(...(await runs(stub)).map((r) => r.due_at));
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 100, more: true });
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 50, more: false });
    expect(await automationMessages(stub)).toHaveLength(150);
  });

  it("skips a run whose rendered subject breaks a line, and still sends the next run", async () => {
    const ws = "ws_aut_newline";
    const { stub, list, aut } = await setup(ws);
    const tpl = (await stub.createTemplate(ws, "app_1", { ...TEMPLATE, subject: "Hi\nthere" })) as { id: string };
    const broken = await stub.createAutomation(ws, "app_1", { name: "Broken", listId: list.id, templateId: tpl.id, fromEmail: FROM, delayHours: 2 });
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    await stub.setAutomationEnabled(ws, broken.id, true, "1 Main St");
    await stub.addMember(ws, list.id, { email: "a@x.com" });
    const due = Math.max(...(await runs(stub)).map((r) => r.due_at));
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 1, skipped: 1, blocked: false });
    const rows = await runs(stub);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: "a@x.com", status: "skipped", error: "invalid_input" }),
        expect.objectContaining({ email: "a@x.com", status: "sent" }),
      ]),
    );
  });

  it("skips pending runs when the automation is disabled, and arms the alarm again on enable", async () => {
    const ws = "ws_aut_toggle";
    const { stub, list, aut } = await setup(ws, "express_optin", 2);
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    await stub.addMember(ws, list.id, { email: "a@x.com" });
    const due = (await runs(stub))[0].due_at;
    await stub.setAutomationEnabled(ws, aut.id, false, "1 Main St");
    expect(await runs(stub)).toEqual([expect.objectContaining({ email: "a@x.com", status: "skipped", error: "disabled" })]);
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 0 });
    expect(await automationMessages(stub)).toEqual([]);

    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    await stub.addMember(ws, list.id, { email: "b@x.com" });
    const dueB = Math.max(...(await runs(stub)).map((r) => r.due_at));
    await runInDurableObject(stub, (_i, state) => state.storage.deleteAlarm());
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).toBe(dueB);
  });

  it("skips a pending run once its template loses the unsubscribe link after enable", async () => {
    const ws = "ws_aut_ready";
    const { stub, list, aut, tpl } = await setup(ws);
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    await stub.addMember(ws, list.id, { email: "a@x.com" });
    await stub.updateTemplate(ws, tpl.id, { html: "<p>Hi</p><p>{{postal_address}}</p>" });
    const due = (await runs(stub))[0].due_at;
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 0, skipped: 1 });
    expect(await runs(stub)).toEqual([expect.objectContaining({ email: "a@x.com", status: "skipped", error: "unsubscribe_missing" })]);
    expect(sendSpy).not.toHaveBeenCalled();
  });
  it("defers its runs, never skips them, when a fresh DO cannot reach D1", async () => {
    const ws = "ws_aut_d1_down";
    const { stub, list, aut } = await setup(ws);
    await stub.setAutomationEnabled(ws, aut.id, true, "1 Main St");
    await stub.addMember(ws, list.id, { email: "a@x.com" });
    const [{ due_at: due }] = await runs(stub);
    await runInDurableObject(stub, (_i, state) => state.storage.kv.delete("limits:v2"));
    const d1 = vi.spyOn(env.CORE_DB, "prepare").mockImplementation(() => {
      throw new Error("D1 down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 0, skipped: 0, blocked: true });
    expect(await runs(stub)).toEqual([expect.objectContaining({ status: "pending", error: null })]);
    d1.mockRestore();
    expect(await stub.runDueAutomations(due)).toMatchObject({ sent: 1, blocked: false });
  });
});
