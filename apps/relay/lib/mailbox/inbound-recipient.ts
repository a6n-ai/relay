import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tenantMailboxes } from "@/db/schema";

/** The one app that holds `email` as a Relay inbox; null when none or more than one does. */
export async function tenantForInbox(email: string): Promise<bigint | null> {
  const rows = await db
    .select({ tenantId: tenantMailboxes.tenantId })
    .from(tenantMailboxes)
    .where(and(eq(tenantMailboxes.email, email.trim().toLowerCase()), eq(tenantMailboxes.kind, "relay_inbox")))
    .limit(2);
  // Uniqueness is only per app; if two apps hold the address, deliver to neither.
  return rows.length === 1 ? rows[0].tenantId : null;
}
