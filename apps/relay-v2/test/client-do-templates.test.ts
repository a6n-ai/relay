import { env, runInDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

const stubFor = (ws: string) => env.CLIENT.get(env.CLIENT.idFromName(ws));

describe("template library in the workspace DO", () => {
  it("creates a template, then lists it", async () => {
    const ws = "ws_tpl_list";
    const stub = stubFor(ws);
    const created = await stub.createTemplate(ws, "app_1", { name: "Welcome", subject: "Hi" });
    expect(created).toMatchObject({ name: "Welcome", locale: "en", enabled: true, event: null });
    const page = await stub.listTemplates(ws, "app_1");
    expect(page.rows.map((r) => r.id)).toEqual([(created as { id: string }).id]);
  });

  it("refuses a second event in the same locale, but allows another locale", async () => {
    const ws = "ws_tpl_event";
    const stub = stubFor(ws);
    const first = await stub.createTemplate(ws, "app_1", { name: "A", event: "order.confirmation", locale: "en" });
    expect(first).toMatchObject({ event: "order.confirmation" });
    expect(await stub.createTemplate(ws, "app_1", { name: "B", event: "order.confirmation", locale: "en" })).toBe("event_taken");
    expect(await stub.createTemplate(ws, "app_1", { name: "C", event: "order.confirmation", locale: "fr" })).toMatchObject({ locale: "fr" });
  });

  it("omits templates without an event from the overrides", async () => {
    const ws = "ws_tpl_overrides";
    const stub = stubFor(ws);
    await stub.createTemplate(ws, "app_1", { name: "Plain" });
    await stub.createTemplate(ws, "app_1", { name: "Evt", event: "signup.done" });
    const overrides = await stub.templateOverrides(ws, "app_1");
    expect(overrides).toEqual([expect.objectContaining({ event: "signup.done", locale: "en", enabled: true })]);
  });

  it("refuses to delete a template an automation names", async () => {
    const ws = "ws_tpl_in_use";
    const stub = stubFor(ws);
    const tpl = (await stub.createTemplate(ws, "app_1", { name: "Used" })) as { id: string };
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO automation (id, app_id, name, list_id, template_id, from_email, delay_hours, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        "aut_inuse0000001", "app_1", "Auto", "ctl_x", tpl.id, "a@x.com", 0, 1, 1,
      );
    });
    expect(await stub.deleteTemplate(ws, tpl.id)).toBe("in_use");
  });
});
