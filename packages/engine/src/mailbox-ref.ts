import { sql, type SQL } from "drizzle-orm";
import type { TenantNotificationTables } from "./tenant-schema";

/** Scalar subquery stamping a letter with its tenant mailbox; null for letters with no tenant. */
export function mailboxIdFor(
  tables: TenantNotificationTables,
  tenantId: bigint | null,
  address: string,
): SQL | null {
  if (tenantId == null) return null;
  const { mailboxes } = tables;
  const normalized = address.trim().toLowerCase();
  return sql`(select ${mailboxes.id} from ${mailboxes} where ${mailboxes.tenantId} = ${tenantId} and ${mailboxes.email} = ${normalized} limit 1)`;
}
