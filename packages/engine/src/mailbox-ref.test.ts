import { PgDialect, bigint, pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { mailboxIdFor } from "./mailbox-ref";
import { makeTenantNotificationTables } from "./tenant-schema";

const tenants = pgTable("tenants", { id: bigint("id", { mode: "bigint" }).primaryKey() });
const mailboxes = pgTable("tenant_mailboxes", {
  id: bigint("id", { mode: "bigint" }).primaryKey(),
  tenantId: bigint("tenant_id", { mode: "bigint" }).notNull(),
  email: text("email").notNull(),
});
const tables = makeTenantNotificationTables({ tenants, mailboxes });

describe("mailboxIdFor", () => {
  it("returns null without a tenant", () => {
    expect(mailboxIdFor(tables, null, "a@b.c")).toBeNull();
  });

  it("normalizes the address and scopes by tenant", () => {
    const sql = mailboxIdFor(tables, 7n, " Support@X.com ");
    expect(sql).not.toBeNull();
    const query = new PgDialect().sqlToQuery(sql!);
    expect(query.params).toEqual([7n, "support@x.com"]);
    expect(query.sql).toContain('"tenant_id" =');
    expect(query.sql).toMatch(/^\(select .* limit 1\)$/);
  });
});
