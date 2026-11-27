import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { getOverview } from "../src/services/overview";
import { coreDb } from "../src/db/core/client";
import { usageDaily } from "../src/db/core/schema";
import { utcDay } from "../src/core/usage";
import { addMember, cookieFor, createWorkspace, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

const headersFor = (cookie: string) => new Headers({ cookie });
const USAGE = { permission: { workspace: ["usage"] } } as const;
const NOV_24 = Date.UTC(2026, 10, 24);

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

describe("workspace overview", { timeout: 60_000 }, () => {
  it("sums this month's usage for the actor's workspace only", async () => {
    const owner = await cookieFor("ov-owner@example.com", "admin");
    const wsId = await createWorkspace(owner, "Overview Sums Co");
    const otherId = await createWorkspace(owner, "Overview Other Co");
    await setActive(owner, wsId);
    await coreDb(env)
      .insert(usageDaily)
      .values([
        { workspaceId: wsId, day: "2026-10-31", sent: 5 },
        { workspaceId: wsId, day: "2026-11-01", sent: 2, inbound: 1 },
        { workspaceId: wsId, day: "2026-11-24", sent: 3, delivered: 3 },
        { workspaceId: otherId, day: "2026-11-24", sent: 99 },
      ]);

    const actor = await requireActor(env, headersFor(owner), USAGE);
    const overview = await getOverview(env, actor, NOV_24);
    expect(overview).toMatchObject({ month: "2026-11", sent: 5, delivered: 3, bounced: 0, inbound: 1, quota: 10000 });
    expect(overview.days).toEqual([
      { day: "2026-11-01", sent: 2, inbound: 1 },
      { day: "2026-11-24", sent: 3, inbound: 0 },
    ]);
  });

  it("needs the usage permission: member refused, billing resolves", async () => {
    const owner = await cookieFor("ov-perm-owner@example.com", "admin");
    const wsId = await createWorkspace(owner, "Overview Perm Co");
    await setActive(owner, wsId);
    const member = await addMember(wsId, "ov-member@example.com", "member");
    const billing = await addMember(wsId, "ov-billing@example.com", "billing");

    await expect(requireActor(env, headersFor(member), USAGE)).rejects.toMatchObject({ status: 403 });
    const actor = await requireActor(env, headersFor(billing), USAGE);
    await expect(getOverview(env, actor, NOV_24)).resolves.toMatchObject({ month: "2026-11", quota: 10000 });
  });

  it("renders the numbers on the overview for an owner", async () => {
    const owner = await cookieFor("ov-page-owner@example.com", "admin");
    const wsId = await createWorkspace(owner, "Overview Page Co");
    await setActive(owner, wsId);
    await coreDb(env).insert(usageDaily).values({ workspaceId: wsId, day: utcDay(Date.now()), sent: 5 });

    const res = await SELF.fetch(`${ORIGIN}/`, { redirect: "manual", headers: { cookie: owner } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("10,000");
    expect(html).toMatch(/>5</);
  });

  it("shows no numbers to a member", async () => {
    const owner = await cookieFor("ov-page-admin@example.com", "admin");
    const wsId = await createWorkspace(owner, "Overview Member Page Co");
    await setActive(owner, wsId);
    const member = await addMember(wsId, "ov-page-member@example.com", "member");

    const res = await SELF.fetch(`${ORIGIN}/`, { redirect: "manual", headers: { cookie: member } });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("10,000");
  });
});
