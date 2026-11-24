import { env, runInDurableObject, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { clientFor } from "../src/core/messages";
import { safeRedirect } from "../src/console/shell.fns";
import { securityDb } from "../src/db/security/client";
import { newId } from "../src/lib/ids";
import { app, member, user, workspace } from "../src/db/security/schema";
import { addMember, cookieFor, createWorkspace, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

const db = securityDb(env);

// The first SSR render compiles the whole UI graph; warm it once so the cold start is not billed to a test.
beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

async function getPage(path: string, cookie?: string): Promise<Response> {
  return SELF.fetch(`${ORIGIN}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
}

async function userIdOf(email: string): Promise<string> {
  const [u] = await db.select().from(user).where(eq(user.email, email));
  return u.id;
}

describe("console shell", { timeout: 60_000 }, () => {
  it("redirects a signed-out visit to sign-in with the path", async () => {
    const res = await getPage("/");
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toBe("/sign-in?redirect=%2F");
  });

  it("renders the sign-in form", async () => {
    const res = await getPage("/sign-in");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('name="email"');
  });

  it("renders the active workspace for an owner", async () => {
    const cookie = await cookieFor("owner-shell@example.com", "admin");
    const wsId = await createWorkspace(cookie, "Shell Owner Co");
    await setActive(cookie, wsId);
    const res = await getPage("/", cookie);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Shell Owner Co");
    expect(html).toContain('aria-label="Switch workspace"');
  });

  it("sends a signed-in user with no workspace to /no-workspace", async () => {
    const cookie = await cookieFor("lone-shell@example.com", "user");
    const res = await getPage("/", cookie);
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toBe("/no-workspace");
  });

  it("moves a removed member off a stale active workspace", async () => {
    const admin = await cookieFor("stale-admin-shell@example.com", "admin");
    const wsA = await createWorkspace(admin, "Stale Alpha Co");
    const wsB = await createWorkspace(admin, "Stale Beta Co");
    const cookie = await cookieFor("stale-shell@example.com", "user");
    const userId = await userIdOf("stale-shell@example.com");
    await db.insert(member).values([
      { organizationId: wsA, userId, role: "member" },
      { organizationId: wsB, userId, role: "member" },
    ]);
    await setActive(cookie, wsA);
    await db.delete(member).where(and(eq(member.organizationId, wsA), eq(member.userId, userId)));

    const res = await getPage("/", cookie);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Stale Beta Co");
  });

  it("shows the suspended notice for a suspended active workspace", async () => {
    const cookie = await cookieFor("suspended-shell@example.com", "admin");
    const wsId = await createWorkspace(cookie, "Suspended Shell Co");
    await setActive(cookie, wsId);
    await db.update(workspace).set({ status: "suspended" }).where(eq(workspace.id, wsId));
    const res = await getPage("/", cookie);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Workspace suspended");
  });

  it("skips a suspended first membership when no active workspace is set", async () => {
    const admin = await cookieFor("suspended-first-admin@example.com", "admin");
    const suspendedId = await createWorkspace(admin, "Suspended First Co");
    const activeId = await createWorkspace(admin, "Active Second Co");
    const cookie = await cookieFor("suspended-first-shell@example.com", "user");
    const userId = await userIdOf("suspended-first-shell@example.com");
    await db.insert(member).values([
      { organizationId: suspendedId, userId, role: "member" },
      { organizationId: activeId, userId, role: "member" },
    ]);
    await db.update(workspace).set({ status: "suspended" }).where(eq(workspace.id, suspendedId));

    const res = await getPage("/", cookie);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Active Second Co");
  });

  it("renders the suspended state when every membership is suspended and none is active", async () => {
    const admin = await cookieFor("only-suspended-admin@example.com", "admin");
    const wsId = await createWorkspace(admin, "Only Suspended Co");
    const cookie = await cookieFor("only-suspended-shell@example.com", "user");
    const userId = await userIdOf("only-suspended-shell@example.com");
    await db.insert(member).values({ organizationId: wsId, userId, role: "member" });
    await db.update(workspace).set({ status: "suspended" }).where(eq(workspace.id, wsId));

    const res = await getPage("/", cookie);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Only Suspended Co");
    expect(html).toContain("Workspace suspended");
  });

  it("shows the suspended state, not the default error, on every page for an all-suspended user", async () => {
    const admin = await cookieFor("all-suspended-admin@example.com", "admin");
    const wsId = await createWorkspace(admin, "All Suspended Co");
    const cookie = await cookieFor("all-suspended-shell@example.com", "user");
    const userId = await userIdOf("all-suspended-shell@example.com");
    await db.insert(member).values({ organizationId: wsId, userId, role: "member" });
    await db.update(workspace).set({ status: "suspended" }).where(eq(workspace.id, wsId));

    for (const path of ["/", "/apps", "/apps/app_missing", "/members"]) {
      const res = await getPage(path, cookie);
      expect(res.status, path).toBe(200);
      const html = await res.text();
      expect(html, path).toContain("This workspace is suspended");
      expect(html, path).not.toContain("Something went wrong");
    }
  });
});

describe("safeRedirect", () => {
  it("keeps a same-origin relative path", () => {
    expect(safeRedirect("/apps")).toBe("/apps");
  });

  it.each([
    ["//evil.example"],
    ["https://evil.example"],
    ["/\\evil"],
    ["/\t/evil.example"],
    ["javascript:alert(1)"],
    [""],
    [undefined],
  ])("rejects %j", (path) => {
    expect(safeRedirect(path)).toBe("/");
  });

  it("keeps an encoded path as a path, not a host", () => {
    expect(safeRedirect("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
  });
});

describe("messages pages", { timeout: 60_000 }, () => {
  async function workspaceWithMail() {
    const tag = crypto.randomUUID().slice(0, 8);
    const owner = await cookieFor(`msg-owner-${tag}@example.com`, "admin");
    const wsId = await createWorkspace(owner, `Mail Page ${tag}`);
    await setActive(owner, wsId);
    const [a] = await db.insert(app).values({ workspaceId: wsId, name: "Mail App", slug: "mail" }).returning();
    const [outId, inId] = [newId("msg"), newId("msg")];
    await runInDurableObject(clientFor(env, wsId), (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO message (id, app_id, direction, stream, status, from_email, to_email, subject, created_at, updated_at) VALUES (?, ?, 'out', 'transactional', 'sent', 'from@example.com', 'to@example.com', 'Outbound SEEDED', 1, 1)",
        outId,
        a.id,
      );
      state.storage.sql.exec(
        "INSERT INTO message (id, app_id, direction, stream, status, from_email, to_email, subject, created_at, updated_at) VALUES (?, ?, 'in', 'transactional', 'sent', 'sender@example.com', 'to@example.com', 'Inbound SEEDED', 2, 2)",
        inId,
        a.id,
      );
    });
    return { owner, wsId, outId, inId, tag };
  }

  it("lists outbound and inbound messages", async () => {
    const t = await workspaceWithMail();
    const out = await getPage("/messages?dir=out", t.owner);
    expect(out.status).toBe(200);
    expect(await out.text()).toContain("Outbound SEEDED");
    const inbound = await getPage("/messages?dir=in", t.owner);
    expect(inbound.status).toBe(200);
    expect(await inbound.text()).toContain("Inbound SEEDED");
  });

  it("renders the letter in a sandboxed frame with no scripts or same origin", async () => {
    const t = await workspaceWithMail();
    const htmlKey = `letter/${t.outId}.html`;
    await env.MAIL.put(htmlKey, "<p>Hello</p>");
    await runInDurableObject(clientFor(env, t.wsId), (_instance, state) => {
      state.storage.sql.exec("UPDATE message SET html_key = ? WHERE id = ?", htmlKey, t.outId);
    });
    const res = await getPage(`/messages/${t.outId}`, t.owner);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('sandbox="allow-popups allow-popups-to-escape-sandbox"');
    expect(html).not.toContain("allow-scripts");
    expect(html).not.toContain("allow-same-origin");
  });

  it("shows the denied state to billing on inbound mail", async () => {
    const t = await workspaceWithMail();
    const billing = await addMember(t.wsId, `msg-billing-${t.tag}@example.com`, "billing");
    const res = await getPage("/messages?dir=in", billing);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Not available to your role");
  });

  it("shows the no-grant copy to a member with no address grants", async () => {
    const t = await workspaceWithMail();
    const member1 = await addMember(t.wsId, `msg-member-${t.tag}@example.com`, "member");
    const res = await getPage("/messages?dir=in", member1);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("No addresses are shared with you yet.");
  });

  it("shows the not-found copy, not the generic error, for a missing message", async () => {
    const t = await workspaceWithMail();
    const res = await getPage("/messages/msg_doesnotexist", t.owner);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("shared with you.");
    expect(html).not.toContain("Something went wrong");
  });
});
