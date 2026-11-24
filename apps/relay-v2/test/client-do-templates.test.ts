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

  it("renders a template for its own app, and reports missing or disabled", async () => {
    const ws = "ws_tpl_render";
    const stub = stubFor(ws);
    const tpl = (await stub.createTemplate(ws, "app_1", {
      name: "R",
      subject: "Hi {{contact.first_name}}",
      html: "<p>{{contact.first_name}} {{unsubscribe_url}}</p>",
      text: "x {{unsubscribe_url}}",
    })) as { id: string };
    const values = { "contact.first_name": "Ana" };
    expect(await stub.renderTemplate(ws, "app_1", tpl.id, values)).toEqual({
      subject: "Hi Ana",
      html: "<p>Ana {{unsubscribe_url}}</p>",
      text: "x {{unsubscribe_url}}",
      hasUnsubscribe: true,
    });
    expect(await stub.renderTemplate(ws, "app_2", tpl.id, values)).toBe("missing");
    await stub.updateTemplate(ws, tpl.id, { enabled: false });
    expect(await stub.renderTemplate(ws, "app_1", tpl.id, values)).toBe("disabled");
  });

  it("copies a template into a campaign, which keeps it when the template changes", async () => {
    const ws = "ws_tpl_campaign";
    const stub = stubFor(ws);
    const tpl = (await stub.createTemplate(ws, "app_1", { name: "C", subject: "Spring", html: "<p>a</p>", text: "a" })) as { id: string };
    const campaign = (await stub.createCampaign(ws, "app_1", "Spring", tpl.id)) as { id: string };
    await stub.updateTemplate(ws, tpl.id, { subject: "Changed", html: "<p>b</p>" });
    expect(await stub.getCampaign(ws, campaign.id)).toMatchObject({ subject: "Spring", html: "<p>a</p>", text: "a" });
    await expect(stub.createCampaign(ws, "app_2", "X", tpl.id)).rejects.toThrow("template not found");
  });
});
