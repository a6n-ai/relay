import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { addApp } from "../src/console/apps";
import { createTemplateFor, getTemplateFor, previewTemplateFor, updateTemplateFor } from "../src/console/templates";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

async function workspaceFor(email: string, name: string) {
  const cookie = await cookieFor(email, "user");
  const workspaceId = await createWorkspace(cookie, name);
  await setActive(cookie, workspaceId);
  const owner = await requireActor(env, headersFor(cookie));
  return { workspaceId, owner };
}

describe("templates console", () => {
  it("lets a member read but refuses create with 403", async () => {
    const { owner, workspaceId } = await workspaceFor("tpl-role@example.com", "Tpl Role Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const made = await createTemplateFor(env, owner, appId, { name: "Welcome" });
    const cookie = await addMember(workspaceId, "tpl-member@example.com", "member");
    const member = await requireActor(env, headersFor(cookie));
    await expect(getTemplateFor(env, member, made.id)).resolves.toMatchObject({ id: made.id });
    await expect(createTemplateFor(env, member, appId, { name: "x" })).rejects.toMatchObject({ status: 403 });
  });

  it("accepts data.* merge fields and refuses contact fields with 400", async () => {
    const { owner } = await workspaceFor("tpl-merge@example.com", "Tpl Merge Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const made = await createTemplateFor(env, owner, appId, { name: "Plan", html: "{{data.plan}}" });
    expect(made).toMatchObject({ html: "{{data.plan}}" });
    await expect(updateTemplateFor(env, owner, made.id, { text: "{{contact.phone}}" })).rejects.toMatchObject({
      status: 400,
      message: "unknown merge field",
    });
  });

  it("returns 404 for a template id from another workspace", async () => {
    const a = await workspaceFor("tpl-iso-a@example.com", "Tpl Iso A");
    const b = await workspaceFor("tpl-iso-b@example.com", "Tpl Iso B");
    const { id: appB } = await addApp(env, b.owner, { name: "Web", slug: "web" });
    const theirs = await createTemplateFor(env, b.owner, appB, { name: "B only" });
    await expect(getTemplateFor(env, a.owner, theirs.id)).rejects.toMatchObject({ status: 404 });
  });

  it("previews without script tags and shows a sample for data fields", async () => {
    const { owner } = await workspaceFor("tpl-preview@example.com", "Tpl Preview Co");
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const made = await createTemplateFor(env, owner, appId, {
      name: "Preview",
      subject: "Hi {{data.plan}}",
      html: "<script>alert(1)</script><p>{{data.plan}}</p>",
      text: "{{data.plan}}",
    });
    const preview = await previewTemplateFor(env, owner, made.id);
    expect(preview.htmlSafe).not.toContain("<script");
    expect(preview.htmlSafe).toContain("sample");
    expect(preview.subject).toBe("Hi sample");
  });
});
