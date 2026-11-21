import { getTableConfig, pgTable, bigint, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { makeTenantNotificationTables } from "./tenant-schema";

const tenants = pgTable("tenants", { id: bigint("id", { mode: "bigint" }).primaryKey() });
const mailboxes = pgTable("tenant_mailboxes", { id: bigint("id", { mode: "bigint" }).primaryKey(), tenantId: bigint("tenant_id", { mode: "bigint" }), email: text("email") });
const t = makeTenantNotificationTables({ tenants, mailboxes });

describe("makeTenantNotificationTables", () => {
  it("email_mailbox has nullable mailbox_id with index", () => {
    const cfg = getTableConfig(t.emailMailbox);
    const col = cfg.columns.find((c) => c.name === "mailbox_id");
    expect(col?.notNull).toBe(false);
    expect(cfg.indexes.map((i) => i.config.name)).toContain("email_mailbox_mailbox_idx");
  });

  it("returns the passed mailboxes table", () => {
    expect(t.mailboxes).toBe(mailboxes);
  });

  it("includes a mailbox snapshot table keyed by outbox id", () => {
    expect(getTableConfig(t.emailMailbox).name).toBe("email_mailbox");
    const names = getTableConfig(t.emailMailbox).columns.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "outbox_id",
        "from_email",
        "to_email",
        "subject",
        "html",
        "text",
        "direction",
        "origin",
        "rfc_message_id",
        "in_reply_to",
        "references",
        "thread_id",
      ]),
    );
  });
});
