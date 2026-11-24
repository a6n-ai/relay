import { env, runInDurableObject } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { runCampaign, type CampaignStep } from "../src/core/campaign-workflow";
import { ensureWorkspaceProfile } from "../src/core/workspace-profile";
import type { ClientDO } from "../src/do/client-do";
import { coreDb } from "../src/db/core/client";
import { workspaceProfile } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { workspace } from "../src/db/security/schema";
import { applyMigrations, seedVerifiedSender } from "./migrate";

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `u${from + i}@x.com`);
const BODY = {
  subject: "Hi {{contact.first_name}}",
  html: '<p>Hi {{contact.first_name}}</p><p>{{postal_address}}</p><a href="{{unsubscribe_url}}">Unsubscribe</a>',
  text: "Hi {{contact.first_name}} {{postal_address}} {{unsubscribe_url}}",
};

let sendBatch: MockInstance;
let sendOne: MockInstance;
const ok = () => Promise.resolve({ metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } });

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(() => {
  sendBatch = vi.spyOn(env.SEND, "sendBatch").mockResolvedValue({ metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } } as never);
  sendOne = vi.spyOn(env.SEND, "send");
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function setup(name: string, monthlyQuota = 100_000) {
  const ws = `ws_run_${name}`;
  await securityDb(env).insert(workspace).values({ id: ws, name: ws, slug: ws });
  await seedVerifiedSender(ws);
  await ensureWorkspaceProfile(env, ws);
  await coreDb(env).update(workspaceProfile).set({ monthlyMessageQuota: monthlyQuota }).where(eq(workspaceProfile.workspaceId, ws));
  return { ws, stub: env.CLIENT.get(env.CLIENT.idFromName(ws)) };
}

type Stub = DurableObjectStub<ClientDO>;

async function listWith(stub: Stub, ws: string, emails: string[]): Promise<string> {
  const list = await stub.createList(ws, "app_1", { name: "L", consentSource: "express_optin" });
  for (const email of emails) await stub.addMember(ws, list.id, { email, firstName: "Ann" });
  return list.id;
}

async function readyCampaign(stub: Stub, ws: string, listIds: string[], at = 0) {
  const c = await stub.createCampaign(ws, "app_1", "C");
  await stub.updateCampaign(ws, c.id, { ...BODY, fromEmail: "relay@a6n.ai", listIds });
  const scheduled = await stub.scheduleCampaign(ws, c.id, at, "1 Main St");
  if (typeof scheduled !== "object" || !("runSeq" in scheduled)) throw new Error("not scheduled");
  return { id: c.id, runSeq: scheduled.runSeq };
}

function fakeStep() {
  const step = {
    do: vi.fn((_name: string, _config: unknown, fn: () => Promise<unknown>) => fn()),
    sleep: vi.fn(async () => {}),
    sleepUntil: vi.fn(async () => {}),
  };
  return { step, asStep: step as unknown as CampaignStep };
}

function rowsOf<T extends Record<string, SqlStorageValue>>(stub: Stub, text: string, ...binds: unknown[]): Promise<T[]> {
  return runInDurableObject(stub, (_instance, state) => state.storage.sql.exec<T>(text, ...binds).toArray());
}

describe("campaign run", () => {
  it("fans out distinct recipients from two lists with no HTML stored per message", async () => {
    const { ws, stub } = await setup("fanout");
    const a = await listWith(stub, ws, range(0, 615));
    const b = await listWith(stub, ws, range(614, 1229));
    const { id, runSeq } = await readyCampaign(stub, ws, [a, b]);
    const { asStep, step } = fakeStep();

    expect(await runCampaign(env, { workspaceId: ws, campaignId: id, runSeq, at: 0 }, asStep)).toBe("done");

    const msgs = await rowsOf<{ status: string; html_key: string | null; text: string | null; merge_data: string | null }>(
      stub,
      "SELECT status, html_key, text, merge_data FROM message WHERE campaign_id = ?",
      id,
    );
    expect(msgs).toHaveLength(1229);
    expect(msgs.every((m) => m.html_key === null && m.text === null && m.merge_data !== null)).toBe(true);
    expect(sendBatch.mock.calls.every(([jobs]) => (jobs as unknown[]).length <= 100)).toBe(true);
    expect(sendOne).not.toHaveBeenCalled();
    expect(step.do.mock.calls.map((c) => c[0])).toEqual(["start", "chunk-0", "chunk-1", "chunk-2"]);
    const [camp] = await rowsOf<{ status: string; recipients: number; queued: number }>(
      stub,
      "SELECT status, recipients, queued FROM campaign WHERE id = ?",
      id,
    );
    expect(camp).toMatchObject({ status: "sent", recipients: 1229, queued: 1229 });
  }, 60_000);

  it("paces chunk 0 to the region rate, and to the default when the binding is unset", async () => {
    const { ws, stub } = await setup("pace");
    const list = await listWith(stub, ws, range(0, 510));
    const bag = env as unknown as Record<string, unknown>;

    bag.SES_MAX_SEND_RATE_AP_SOUTH_1 = "10";
    const first = await readyCampaign(stub, ws, [list]);
    const fast = fakeStep();
    await runCampaign(env, { workspaceId: ws, campaignId: first.id, runSeq: first.runSeq, at: 0 }, fast.asStep);
    expect(fast.step.sleep).toHaveBeenCalledWith("pace-0", 50_000);
    const fastJobs = sendBatch.mock.calls[4][0] as { delaySeconds: number }[];
    expect(fastJobs[fastJobs.length - 1].delaySeconds).toBe(49);
    delete bag.SES_MAX_SEND_RATE_AP_SOUTH_1;

    sendBatch.mockClear();
    const second = await readyCampaign(stub, ws, [list]);
    const slow = fakeStep();
    await runCampaign(env, { workspaceId: ws, campaignId: second.id, runSeq: second.runSeq, at: 0 }, slow.asStep);
    expect(slow.step.sleep).toHaveBeenCalledWith("pace-0", 36_000);
    expect(slow.step.do.mock.calls.map((c) => c[0])).toEqual(["start", "chunk-0", "chunk-1"]);
  }, 60_000);

  it("writes a suppressed row for an opted-out member, with no enqueue and no quota", async () => {
    const { ws, stub } = await setup("suppressed");
    const list = await listWith(stub, ws, ["u0@x.com", "u1@x.com", "u2@x.com"]);
    await stub.addSuppression(ws, "u1@x.com", "bounce");
    const { id, runSeq } = await readyCampaign(stub, ws, [list]);
    const { asStep } = fakeStep();

    expect(await runCampaign(env, { workspaceId: ws, campaignId: id, runSeq, at: 0 }, asStep)).toBe("done");

    const rows = await rowsOf<{ to_email: string; status: string; subject: string }>(
      stub,
      "SELECT to_email, status, subject FROM message WHERE campaign_id = ? ORDER BY to_email",
      id,
    );
    expect(rows.find((r) => r.to_email === "u1@x.com")?.status).toBe("suppressed");
    expect(rows.find((r) => r.to_email === "u0@x.com")).toMatchObject({ status: "queued", subject: "Hi Ann" });
    const enqueued = sendBatch.mock.calls.flatMap(([jobs]) => jobs as { body: { messageId: string } }[]);
    expect(enqueued).toHaveLength(2);
  });

  it("retries a failed sub-chunk without duplicate rows or a double count", async () => {
    const { ws, stub } = await setup("retry");
    const list = await listWith(stub, ws, range(0, 260));
    const { id, runSeq } = await readyCampaign(stub, ws, [list]);
    expect(await stub.startCampaign(ws, id, runSeq)).toBe("go");
    // A plain function, not the spy: vitest's spy bookkeeping reports a rejected call from inside a DO as unhandled.
    let calls = 0;
    const bag = env.SEND as unknown as { sendBatch: unknown };
    const spy = bag.sendBatch;
    bag.sendBatch = () => {
      calls += 1;
      if (calls === 2) throw new Error("boom");
      return ok();
    };
    try {
      // RPC rejections surface as unhandled in this plugin, so the failing call runs inside the DO.
      const first = await runInDurableObject(stub, (inst) =>
        inst.campaignChunk(ws, id, runSeq).then(() => "resolved", (e: Error) => e.message),
      );
      expect(first).toBe("boom");
      expect(await stub.campaignChunk(ws, id, runSeq)).toMatchObject({ state: "done" });
    } finally {
      bag.sendBatch = spy;
    }

    const dupes = await rowsOf<{ c: number }>(stub, "SELECT count(*) AS c FROM message WHERE campaign_id = ? GROUP BY to_email HAVING c > 1", id);
    expect(dupes).toHaveLength(0);
    const [{ n }] = await rowsOf<{ n: number }>(stub, "SELECT count(*) AS n FROM message WHERE campaign_id = ?", id);
    expect(n).toBe(260);
    const [camp] = await rowsOf<{ queued: number; recipients: number }>(stub, "SELECT queued, recipients FROM campaign WHERE id = ?", id);
    expect(camp).toMatchObject({ queued: 260, recipients: 260 });
  }, 60_000);

  it("pauses mid-chunk, then a resumed run finishes with no duplicates", async () => {
    const { ws, stub } = await setup("pausemid");
    const list = await listWith(stub, ws, range(0, 260));
    const { id, runSeq } = await readyCampaign(stub, ws, [list]);
    expect(await stub.startCampaign(ws, id, runSeq)).toBe("go");
    let calls = 0;
    // The stub is built inside the call so it belongs to the DO that makes the call; the test's own stub cannot cross.
    sendBatch.mockImplementation(() => {
      calls += 1;
      if (calls !== 2) return ok();
      return env.CLIENT.get(env.CLIENT.idFromName(ws))
        .pauseCampaign(ws, id)
        .then(ok);
    });

    expect(await stub.campaignChunk(ws, id, runSeq)).toMatchObject({ state: "stopped", enqueued: 200 });
    expect(await stub.resumeCampaign(ws, id)).toEqual({ runSeq: runSeq + 1 });
    expect(await runCampaign(env, { workspaceId: ws, campaignId: id, runSeq: runSeq + 1, at: 0 }, fakeStep().asStep)).toBe("done");

    const dupes = await rowsOf<{ c: number }>(stub, "SELECT count(*) AS c FROM message WHERE campaign_id = ? GROUP BY to_email HAVING c > 1", id);
    expect(dupes).toHaveLength(0);
    const [{ n }] = await rowsOf<{ n: number }>(stub, "SELECT count(*) AS n FROM message WHERE campaign_id = ?", id);
    expect(n).toBe(260);
  }, 60_000);

  it("stops a run whose sequence is stale without sending", async () => {
    const { ws, stub } = await setup("stale");
    const list = await listWith(stub, ws, range(0, 3));
    const { id } = await readyCampaign(stub, ws, [list]);
    expect(await runCampaign(env, { workspaceId: ws, campaignId: id, runSeq: 0, at: 0 }, fakeStep().asStep)).toBe("stopped");
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("pauses on quota with quota_exceeded, and cancel fails the unclaimed rows", async () => {
    const { ws, stub } = await setup("quota", 50);
    const list = await listWith(stub, ws, range(0, 260));
    const { id, runSeq } = await readyCampaign(stub, ws, [list]);

    expect(await runCampaign(env, { workspaceId: ws, campaignId: id, runSeq, at: 0 }, fakeStep().asStep)).toBe("stopped");
    expect(await stub.getCampaign(ws, id)).toMatchObject({ status: "paused", error: "quota_exceeded" });
    const [{ n }] = await rowsOf<{ n: number }>(stub, "SELECT count(*) AS n FROM message WHERE campaign_id = ?", id);
    expect(n).toBe(50);

    expect(await stub.cancelCampaign(ws, id)).toEqual({ dropped: 50 });
    const [camp] = await rowsOf<{ status: string; queued: number; failed: number }>(
      stub,
      "SELECT status, queued, failed FROM campaign WHERE id = ?",
      id,
    );
    expect(camp).toMatchObject({ status: "cancelled", queued: 0, failed: 50 });
    const [msg] = await rowsOf<{ id: string }>(stub, "SELECT id FROM message WHERE campaign_id = ? LIMIT 1", id);
    expect(await stub.claimSend(ws, msg.id)).toEqual({ kind: "skip", reason: "failed" });
  }, 60_000);

  it("refuses to schedule without a postal address and keeps the draft", async () => {
    const { ws, stub } = await setup("nopostal");
    const list = await listWith(stub, ws, range(0, 3));
    const c = await stub.createCampaign(ws, "app_1", "C");
    await stub.updateCampaign(ws, c.id, { ...BODY, fromEmail: "relay@a6n.ai", listIds: [list] });
    expect(await stub.scheduleCampaign(ws, c.id, 0, null)).toEqual({ problems: ["postal_address_missing"] });
    expect(await stub.getCampaign(ws, c.id)).toMatchObject({ status: "draft" });
  });

  it("sleeps until a future start time once", async () => {
    const { ws, stub } = await setup("future");
    const list = await listWith(stub, ws, range(0, 3));
    const at = Date.now() + 3_600_000;
    const { id, runSeq } = await readyCampaign(stub, ws, [list], at);
    const { asStep, step } = fakeStep();
    await runCampaign(env, { workspaceId: ws, campaignId: id, runSeq, at }, asStep);
    expect(step.sleepUntil).toHaveBeenCalledTimes(1);
    expect(step.sleepUntil).toHaveBeenCalledWith("wait", new Date(at));
  });
});
