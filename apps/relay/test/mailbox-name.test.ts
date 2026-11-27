import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { mailboxCandidates, mailboxFree, suggestMailbox } from "../src/core/mailbox-name";
import { coreDb } from "../src/db/core/client";
import { address } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { invitation, user, workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

describe("mailboxCandidates", () => {
  it("orders first, first.last, then numbered", () => {
    expect(mailboxCandidates("Ravi Kumar", "a6n.ai").slice(0, 3)).toEqual(["ravi@a6n.ai", "ravi.kumar@a6n.ai", "ravi2@a6n.ai"]);
  });
  it("strips accents, skips first.last for one word, falls back to user", () => {
    expect(mailboxCandidates("Zoë", "a6n.ai")[0]).toBe("zoe@a6n.ai");
    expect(mailboxCandidates("  Prince ", "a6n.ai")[1]).toBe("prince2@a6n.ai");
    expect(mailboxCandidates("!!!", "a6n.ai")[0]).toBe("user@a6n.ai");
  });
});

describe("mailboxFree", () => {
  it("is false for an address row and for a pending invite", async () => {
    await coreDb(env).insert(address).values({ workspaceId: "wsp_m", appId: "app_m", email: "taken@a6n.ai", kind: "personal", ownerUserId: "usr_m" });
    expect(await mailboxFree(env, "taken@a6n.ai")).toBe(false);

    const db = securityDb(env);
    const [ws] = await db.insert(workspace).values({ name: "m", slug: "mbx-name" }).returning();
    const [inviter] = await db.insert(user).values({ name: "i", email: "mbx-inviter@example.com" }).returning();
    await db.insert(invitation).values({ organizationId: ws.id, email: "invited@a6n.ai", inviterId: inviter.id, expiresAt: new Date(Date.now() + 86_400_000) });
    expect(await mailboxFree(env, "invited@a6n.ai")).toBe(false);
    await db.insert(invitation).values({ organizationId: ws.id, email: "stale@a6n.ai", inviterId: inviter.id, expiresAt: new Date(Date.now() - 1000) });
    expect(await mailboxFree(env, "stale@a6n.ai")).toBe(true);
  });

  it("is true for a leftover user with no member and no credential", async () => {
    await securityDb(env).insert(user).values({ name: "L", email: "left@a6n.ai" });
    expect(await mailboxFree(env, "left@a6n.ai")).toBe(true);
  });
});

describe("suggestMailbox", () => {
  it("skips a taken first name", async () => {
    await coreDb(env).insert(address).values({ workspaceId: "wsp_s", appId: "app_s", email: "ravi@a6n.ai", kind: "personal", ownerUserId: "usr_s" });
    expect(await suggestMailbox(env, "Ravi Kumar", "a6n.ai")).toBe("ravi.kumar@a6n.ai");
  });
});
