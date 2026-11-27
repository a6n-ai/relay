import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { coreDb } from "../src/db/core/client";
import { address } from "../src/db/core/schema";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

describe("personal address columns", () => {
  it("stores a personal address with an owner", async () => {
    const db = coreDb(env);
    await db.insert(address).values({ workspaceId: "wsp_p", appId: "app_p", email: "ravi@a6n.ai", kind: "personal", ownerUserId: "usr_1" });
    const [row] = await db.select().from(address).where(eq(address.email, "ravi@a6n.ai"));
    expect(row.kind).toBe("personal");
    expect(row.ownerUserId).toBe("usr_1");
    expect(row.closedAt).toBeNull();
    await expect(
      db.insert(address).values({ workspaceId: "wsp_p", appId: "app_p", email: "ravi2@a6n.ai", kind: "personal", ownerUserId: "usr_1" }),
    ).rejects.toThrow();
  });
});
