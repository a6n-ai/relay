import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tenantMailboxes } from "@/db/schema";

/** The app that holds `email` as a Relay inbox, or null when none does. */
export async function tenantForInbox(email: string): Promise<bigint | null> {
  const [row] = await db
    .select({ tenantId: tenantMailboxes.tenantId })
    .from(tenantMailboxes)
    .where(and(eq(tenantMailboxes.email, email.trim().toLowerCase()), eq(tenantMailboxes.kind, "relay_inbox")))
    .limit(1);
  return row?.tenantId ?? null;
}
