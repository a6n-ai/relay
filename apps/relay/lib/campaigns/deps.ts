import type { CampaignRouteDeps } from "@relay/engine";
import { db } from "@/db/client";
import { campaignTables, notificationTables, users } from "@/db/schema";

/**
 * Lists, audience counts, and campaign CRUD talk to engine helpers that type
 * tables as NotificationTables & CampaignTables. Relay's outbox is tenant-scoped;
 * those helpers never write the outbox — send uses enqueueTenant instead.
 */
export function operatorCampaignDeps(): CampaignRouteDeps {
  return {
    db,
    tables: { ...notificationTables, ...campaignTables } as unknown as CampaignRouteDeps["tables"],
    users: { table: users, columns: { id: users.id, email: users.email } },
    resolveSegment: async () => [],
  };
}
