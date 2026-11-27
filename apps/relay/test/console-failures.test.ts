import { env, runInDurableObject, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor, type ConsoleActor } from "../src/console/actor";
import { addApp } from "../src/console/apps";
import { addGrant } from "../src/console/grants";
import { deleteFailureFor, listFailuresFor, replayFailureFor } from "../src/console/failures";
import { getMessageFor } from "../src/console/messages";
import { createAddress, deleteAddress } from "../src/core/addresses";
import { clientFor } from "../src/do/client";
import { coreDb } from "../src/db/core/client";
import { usageDaily } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { member, user } from "../src/db/security/schema";
import type { InboundJob } from "../src/core/jobs";
import { utcDay } from "../src/core/usage";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

const eml = (lines: string[]) => new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer;
const letter = ({ messageId = true }: { messageId?: boolean } = {}) =>
  eml([
    "From: cust@example.com",
    "To: in@failures.test",
    "Subject: Hello",
    ...(messageId ? ["Message-ID: <fail-1@x>"] : []),
    "Date: Tue, 01 Jul 2025 10:00:00 +0000",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Hello there",
  ]);

async function workspaceFor(email: string, name: string) {
  const cookie = await cookieFor(email, "user");
  const workspaceId = await createWorkspace(cookie, name);
  await setActive(cookie, workspaceId);
  const owner = await requireActor(env, headersFor(cookie), { permission: { mailbox: ["manage"] }, write: true });
  return { cookie, workspaceId, owner };
}

// Skips the console's domain-verification gate: these tests are about inbound failures, not DNS.
async function inboxFor(owner: ConsoleActor, domain: string) {
  const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
  const email = `in@${domain}`;
  const { id: addressId } = await createAddress(env, { workspaceId: owner.workspaceId, appId, email, kind: "both" });
  return { appId, addressId, email };
}

// The letter is staged in R2 under the workspace's raw prefix, the same place the email worker writes it.
async function stage(workspaceId: string, inbox: { appId: string; addressId: string; email: string }, bytes = letter()) {
  const rawKey = `ws/${workspaceId}/raw/2026/11/${crypto.randomUUID()}.eml`;
  await env.MAIL.put(rawKey, bytes);
  const job: InboundJob = {
    workspaceId,
    appId: inbox.appId,
    addressId: inbox.addressId,
    rawKey,
    envelopeFrom: "bounce@example.com",
    envelopeTo: inbox.email,
    authResults: "mx; dmarc=pass",
    receivedAt: 1_700_000_000_000,
  };
  return job;
}

const stub = (workspaceId: string) => clientFor(env, workspaceId);

async function failureIdOf(workspaceId: string, rawKey: string): Promise<string> {
  return runInDurableObject(stub(workspaceId), (_i, state) => {
    const [row] = state.storage.sql.exec("SELECT id FROM inbound_failure WHERE raw_key = ?", rawKey).toArray() as { id: string }[];
    return row.id;
  });
}

async function failuresOf(workspaceId: string) {
  return runInDurableObject(stub(workspaceId), (_i, state) =>
    state.storage.sql.exec("SELECT raw_key, attempts, error FROM inbound_failure").toArray(),
  );
}

describe("inbound failures console", () => {
  it("replay of a letter with no Message-ID fails again and bumps attempts", async () => {
    const { owner, workspaceId } = await workspaceFor("fail-retry@example.com", "Fail Retry Co");
    const inbox = await inboxFor(owner, "failures-retry.test");
    const job = await stage(workspaceId, inbox, letter({ messageId: false }));
    await stub(workspaceId).recordInboundFailure(workspaceId, job, "Missing Message-ID");
    const [before] = await listFailuresFor(env, owner);
    expect(before.attempts).toBe(1);
    expect(await replayFailureFor(env, owner, before.id)).toEqual({ outcome: "failed", error: "Missing Message-ID" });
    const [after] = await listFailuresFor(env, owner);
    expect(after.attempts).toBe(2);
  });

  it("replay of a fixed letter inserts the message, removes the failure and bumps inbound usage", async () => {
    const { owner, workspaceId } = await workspaceFor("fail-ok@example.com", "Fail Ok Co");
    const inbox = await inboxFor(owner, "failures-ok.test");
    const job = await stage(workspaceId, inbox, letter({ messageId: false }));
    await stub(workspaceId).recordInboundFailure(workspaceId, job, "Missing Message-ID");
    const id = await failureIdOf(workspaceId, job.rawKey);
    await env.MAIL.put(job.rawKey, letter());
    const result = await replayFailureFor(env, owner, id);
    expect(result).toEqual({ outcome: "inserted", messageId: expect.stringMatching(/^msg_/) });
    const { messageId } = result as { messageId: string };
    expect(await listFailuresFor(env, owner)).toEqual([]);
    expect(await getMessageFor(env, owner, messageId, { images: false })).toMatchObject({ id: messageId });
    const [usage] = await coreDb(env)
      .select({ inbound: usageDaily.inbound })
      .from(usageDaily)
      .where(and(eq(usageDaily.workspaceId, workspaceId), eq(usageDaily.day, utcDay(job.receivedAt))));
    expect(usage.inbound).toBe(1);
  });

  it("replay of a letter whose Message-ID is already stored removes the failure and keeps the raw letter", async () => {
    const { owner, workspaceId } = await workspaceFor("fail-dup@example.com", "Fail Dup Co");
    const inbox = await inboxFor(owner, "failures-dup.test");
    const first = await stage(workspaceId, inbox);
    expect(await stub(workspaceId).ingestInbound(workspaceId, first)).toMatchObject({ outcome: "inserted" });
    await runInDurableObject(stub(workspaceId), (_i, state) => {
      state.storage.sql.exec(
        "INSERT INTO inbound_failure (id, raw_key, app_id, address_id, envelope_from, envelope_to, auth_results, received_at, error, attempts, created_at, updated_at) VALUES ('ibf_dup00000000001', ?, ?, ?, 'bounce@example.com', ?, NULL, ?, 'Processing failed', 1, 0, 0)",
        first.rawKey,
        inbox.appId,
        inbox.addressId,
        inbox.email,
        first.receivedAt,
      );
    });
    expect(await replayFailureFor(env, owner, "ibf_dup00000000001")).toMatchObject({ outcome: "duplicate" });
    expect(await listFailuresFor(env, owner)).toEqual([]);
    expect(await env.MAIL.get(first.rawKey)).not.toBeNull();
  });

  it("a missing raw letter is 409 raw letter missing, keeps the row, and delete still removes it", async () => {
    const { owner, workspaceId } = await workspaceFor("fail-gone@example.com", "Fail Gone Co");
    const inbox = await inboxFor(owner, "failures-gone.test");
    const job = await stage(workspaceId, inbox);
    await stub(workspaceId).recordInboundFailure(workspaceId, job, "Processing failed");
    const id = await failureIdOf(workspaceId, job.rawKey);
    await env.MAIL.delete(job.rawKey);
    await expect(replayFailureFor(env, owner, id)).rejects.toMatchObject({ status: 409, message: "raw letter missing" });
    expect(await listFailuresFor(env, owner)).toHaveLength(1);
    await expect(deleteFailureFor(env, owner, id)).resolves.toBeUndefined();
    expect(await listFailuresFor(env, owner)).toEqual([]);
  });

  it("delete removes the row and its raw letter", async () => {
    const { owner, workspaceId } = await workspaceFor("fail-del@example.com", "Fail Del Co");
    const inbox = await inboxFor(owner, "failures-del.test");
    const job = await stage(workspaceId, inbox);
    await stub(workspaceId).recordInboundFailure(workspaceId, job, "Processing failed");
    const id = await failureIdOf(workspaceId, job.rawKey);
    await deleteFailureFor(env, owner, id);
    expect(await failuresOf(workspaceId)).toEqual([]);
    expect(await env.MAIL.get(job.rawKey)).toBeNull();
  });

  it("a row with no address cannot be replayed as 409 cannot replay", async () => {
    const { owner, workspaceId } = await workspaceFor("fail-noaddr@example.com", "Fail NoAddr Co");
    const inbox = await inboxFor(owner, "failures-noaddr.test");
    const job = await stage(workspaceId, inbox);
    await stub(workspaceId).recordInboundFailure(workspaceId, job, "Processing failed");
    const id = await failureIdOf(workspaceId, job.rawKey);
    await runInDurableObject(stub(workspaceId), (_i, state) => {
      state.storage.sql.exec("UPDATE inbound_failure SET address_id = NULL WHERE id = ?", id);
    });
    await expect(replayFailureFor(env, owner, id)).rejects.toMatchObject({ status: 409, message: "cannot replay" });
  });

  it("a replay after the address was deleted is 409 address removed", async () => {
    const { owner, workspaceId } = await workspaceFor("fail-addr@example.com", "Fail Addr Co");
    const inbox = await inboxFor(owner, "failures-addr.test");
    const job = await stage(workspaceId, inbox);
    await stub(workspaceId).recordInboundFailure(workspaceId, job, "Processing failed");
    const id = await failureIdOf(workspaceId, job.rawKey);
    await deleteAddress(env, workspaceId, inbox.addressId);
    await expect(replayFailureFor(env, owner, id)).rejects.toMatchObject({ status: 409, message: "address removed" });
  });

  it("a member sees failures only for granted addresses, and cannot replay", async () => {
    const { owner, workspaceId } = await workspaceFor("fail-grant@example.com", "Fail Grant Co");
    const inbox = await inboxFor(owner, "failures-grant.test");
    const job = await stage(workspaceId, inbox);
    await stub(workspaceId).recordInboundFailure(workspaceId, job, "Processing failed");
    const id = await failureIdOf(workspaceId, job.rawKey);
    const memberCookie = await addMember(workspaceId, "fail-grant-m@example.com", "member");
    const memberActor = await requireActor(env, headersFor(memberCookie), { permission: { mailbox: ["read"] } });
    expect(await listFailuresFor(env, memberActor)).toEqual([]);
    const [row] = await securityDb(env)
      .select({ id: member.id })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, workspaceId), eq(user.email, "fail-grant-m@example.com")));
    await addGrant(env, owner, { addressId: inbox.addressId, memberId: row.id });
    const rows = await listFailuresFor(env, memberActor);
    expect(rows.map((r) => r.id)).toEqual([id]);
    expect(Object.keys(rows[0])).not.toContain("rawKey");
    await expect(replayFailureFor(env, memberActor, id)).rejects.toMatchObject({ status: 403 });
  });

  it("an id from another workspace is 404", async () => {
    const a = await workspaceFor("fail-scope-a@example.com", "Fail Scope A");
    const b = await workspaceFor("fail-scope-b@example.com", "Fail Scope B");
    const inbox = await inboxFor(a.owner, "failures-scope.test");
    const job = await stage(a.workspaceId, inbox);
    await stub(a.workspaceId).recordInboundFailure(a.workspaceId, job, "Processing failed");
    const id = await failureIdOf(a.workspaceId, job.rawKey);
    await expect(replayFailureFor(env, b.owner, id)).rejects.toMatchObject({ status: 404 });
    await expect(deleteFailureFor(env, b.owner, id)).rejects.toMatchObject({ status: 404 });
    expect(await listFailuresFor(env, a.owner)).toHaveLength(1);
  });

  it("a suspended workspace lists failures but refuses replay", async () => {
    const { owner, workspaceId } = await workspaceFor("fail-susp@example.com", "Fail Susp Co");
    const inbox = await inboxFor(owner, "failures-susp.test");
    const job = await stage(workspaceId, inbox);
    await stub(workspaceId).recordInboundFailure(workspaceId, job, "Processing failed");
    const id = await failureIdOf(workspaceId, job.rawKey);
    const suspended: ConsoleActor = { ...owner, workspaceStatus: "suspended" };
    expect(await listFailuresFor(env, suspended)).toHaveLength(1);
    await expect(replayFailureFor(env, suspended, id)).rejects.toMatchObject({ status: 403, message: "workspace suspended" });
    await expect(deleteFailureFor(env, suspended, id)).rejects.toMatchObject({ status: 403 });
  });
});
