import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import worker from "../src/server";
import { setWorkspaceStatus } from "../src/console/admin";
import { createAddress } from "../src/core/addresses";
import type { InboundJob } from "../src/env";
import { coreDb } from "../src/db/core/client";
import { address } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { app, workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

async function tenant(slug: string) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [a] = await db.insert(app).values({ workspaceId: ws.id, name: slug, slug: "main" }).returning();
  return { workspaceId: ws.id, appId: a.id };
}

const LETTER = new TextEncoder().encode("From: a@sender.test\r\nTo: info@tiffingrab.ca\r\nSubject: hi\r\n\r\nbody");

function fakeMessage(opts: { to: string; headers?: Record<string, string>; rawSize?: number }) {
  const setReject = vi.fn();
  const message = {
    from: "bounce@sender.test",
    to: opts.to,
    rawSize: opts.rawSize ?? LETTER.byteLength,
    raw: new Response(LETTER).body,
    headers: new Headers(opts.headers ?? {}),
    setReject,
  } as unknown as ForwardableEmailMessage;
  return { message, setReject };
}

const receive = (message: ForwardableEmailMessage) => worker.email!(message, env);

let send: MockInstance<typeof env.INBOUND.send>;
let put: MockInstance<typeof env.MAIL.put>;
let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  send = vi.spyOn(env.INBOUND, "send").mockResolvedValue(undefined as never);
  put = vi.spyOn(env.MAIL, "put");
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // PII never logged: the console arguments carry ids and fixed strings only.
  for (const call of consoleError.mock.calls) {
    expect(call.map(String).some((part) => part.includes("@"))).toBe(false);
  }
  vi.restoreAllMocks();
});

describe("email worker", () => {
  it("routes a mixed-case recipient to the inbox address with the raw letter in R2", async () => {
    const a = await tenant("ew-route");
    const { id: addressId } = await createAddress(env, {
      workspaceId: a.workspaceId,
      appId: a.appId,
      email: "info@tiffingrab.ca",
      kind: "inbox",
    });
    const { message, setReject } = fakeMessage({ to: " Info@TiffinGrab.ca " });

    await receive(message);

    expect(setReject).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    const job = send.mock.calls[0][0] as InboundJob;
    expect(job).toMatchObject({
      workspaceId: a.workspaceId,
      appId: a.appId,
      addressId,
      envelopeTo: "info@tiffingrab.ca",
      envelopeFrom: "bounce@sender.test",
      authResults: null,
    });
    expect(job.rawKey).toMatch(new RegExp(`^ws/${a.workspaceId}/raw/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.eml$`));
    const stored = await env.MAIL.get(job.rawKey);
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(LETTER);
  });

  it("rejects a sender-only address and an unknown address without writing R2 or queueing", async () => {
    const a = await tenant("ew-sender");
    await createAddress(env, { workspaceId: a.workspaceId, appId: a.appId, email: "relay@sender-only.test", kind: "sender" });

    for (const to of ["relay@sender-only.test", "nobody@nowhere.test"]) {
      const { message, setReject } = fakeMessage({ to });
      await receive(message);
      expect(setReject).toHaveBeenCalledWith("No such mailbox");
    }
    expect(put).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a letter that fails DMARC without writing R2 or queueing", async () => {
    const a = await tenant("ew-dmarc");
    await createAddress(env, { workspaceId: a.workspaceId, appId: a.appId, email: "dmarc@ew-dmarc.test", kind: "inbox" });
    const { message, setReject } = fakeMessage({
      to: "dmarc@ew-dmarc.test",
      headers: { "authentication-results": "mx; dmarc=fail" },
    });

    await receive(message);

    expect(setReject).toHaveBeenCalledWith("Message failed DMARC");
    expect(put).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a letter over 25 MiB before any lookup", async () => {
    const { message, setReject } = fakeMessage({ to: "big@ew-size.test", rawSize: 26_214_401 });

    await receive(message);

    expect(setReject).toHaveBeenCalledWith("Message is larger than 25 MiB");
    expect(put).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("deletes the raw letter and rejects as unavailable when the queue send fails", async () => {
    const a = await tenant("ew-queue");
    await createAddress(env, { workspaceId: a.workspaceId, appId: a.appId, email: "info@ew-queue.test", kind: "inbox" });
    send.mockRejectedValueOnce(new Error("queue down"));
    const { message, setReject } = fakeMessage({ to: "info@ew-queue.test" });

    await receive(message);

    expect(setReject).toHaveBeenCalledWith("Mailbox unavailable");
    const key = put.mock.calls[0][0];
    expect(await env.MAIL.get(key)).toBeNull();
  });
});

describe("email worker after a workspace is suspended", () => {
  const DAY = 24 * 60 * 60 * 1000;

  async function inboxFor(slug: string) {
    const a = await tenant(slug);
    const to = `hi@${slug}.test`;
    await createAddress(env, { workspaceId: a.workspaceId, appId: a.appId, email: to, kind: "inbox" });
    return { ...a, to };
  }

  async function suspendAt(workspaceId: string, suspendedAt: Date | null) {
    await securityDb(env).update(workspace).set({ status: "suspended", suspendedAt }).where(eq(workspace.id, workspaceId));
  }

  it("accepts an active workspace's mail", async () => {
    const a = await inboxFor("ew-active");
    const { message, setReject } = fakeMessage({ to: a.to });
    await receive(message);
    expect(setReject).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps accepting mail one day after suspension", async () => {
    const a = await inboxFor("ew-grace");
    await suspendAt(a.workspaceId, new Date(Date.now() - DAY));
    const { message, setReject } = fakeMessage({ to: a.to });
    await receive(message);
    expect(setReject).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("rejects mail eight days after suspension without writing R2 or queueing", async () => {
    const a = await inboxFor("ew-expired");
    await suspendAt(a.workspaceId, new Date(Date.now() - 8 * DAY));
    const { message, setReject } = fakeMessage({ to: a.to });
    await receive(message);
    expect(setReject).toHaveBeenCalledWith("Mailbox unavailable");
    expect(put).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a suspended workspace with no suspension time", async () => {
    const a = await inboxFor("ew-no-time");
    await suspendAt(a.workspaceId, null);
    const { message, setReject } = fakeMessage({ to: a.to });
    await receive(message);
    expect(setReject).toHaveBeenCalledWith("Mailbox unavailable");
    expect(put).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("accepts mail again after a suspended workspace is resumed", async () => {
    const a = await inboxFor("ew-resume");
    await setWorkspaceStatus(env, { userId: "usr_ops_test" }, a.workspaceId, "suspended");
    await setWorkspaceStatus(env, { userId: "usr_ops_test" }, a.workspaceId, "active");
    const { message, setReject } = fakeMessage({ to: a.to });
    await receive(message);
    expect(setReject).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("rejects an address whose workspace row is missing", async () => {
    await coreDb(env).insert(address).values({ workspaceId: "wsp_missing_ew", appId: "app_missing_ew", email: "hi@ew-orphan.test", kind: "inbox" });
    const { message, setReject } = fakeMessage({ to: "hi@ew-orphan.test" });
    await receive(message);
    expect(setReject).toHaveBeenCalledWith("Mailbox unavailable");
    expect(put).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
