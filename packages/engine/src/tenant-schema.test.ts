import { getTableConfig, pgTable, bigint } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { makeTenantNotificationTables } from "./tenant-schema";

const tenants = pgTable("tenants", { id: bigint("id", { mode: "bigint" }).primaryKey() });
const t = makeTenantNotificationTables({ tenants });

describe("makeTenantNotificationTables", () => {
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
      ]),
    );
  });
});
