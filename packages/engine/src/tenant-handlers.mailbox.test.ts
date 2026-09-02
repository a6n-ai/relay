import { describe, expect, it, vi } from "vitest";
import { pgTable, bigint } from "drizzle-orm/pg-core";
import { buildTenantHandlers } from "./tenant-handlers";
import { makeTenantNotificationTables } from "./tenant-schema";

const tenants = pgTable("tenants", { id: bigint("id", { mode: "bigint" }).primaryKey() });
const tables = makeTenantNotificationTables({ tenants });

function mailboxDb() {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const db = {
    insert: () => ({
      values: (v: unknown) => {
        inserts.push(v);
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
    update: () => ({
      set: (v: unknown) => ({
        where: async () => {
          updates.push(v);
        },
      }),
    }),
  };
  return { db, inserts, updates };
}

describe("buildTenantHandlers email mailbox threading", () => {
  it("stores provider Message-ID as rfc_message_id and thread_id after send", async () => {
    const { db, updates } = mailboxDb();
    const send = vi.fn().mockResolvedValue({ providerMessageId: "<abc@relay.test>" });
    const handlers = buildTenantHandlers({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: db as any,
      tables,
      providers: { email: { send } },
    });
    await handlers.email!({
      id: 11n,
      tenantId: 22n,
      recipientEmail: "a@b.com",
      campaignId: null,
      event: null,
      payload: { title: "Hi", body: "body" },
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].rfcMessageId).toMatch(/^<.+@relay\.invalid>$/);
    expect(updates[0]).toMatchObject({
      rfcMessageId: "<abc@relay.test>",
      threadId: "<abc@relay.test>",
    });
  });
});
