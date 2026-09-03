import { and, eq } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { appMessageTags } from "@/db/schema";
import { conversationTagSlug } from "@/lib/mailbox/conversation-tag";
import { SessionUpdatableService } from "./session-service";

class AppMessageTagsService extends SessionUpdatableService<typeof appMessageTags> {
  async forTenant(tenantId: bigint) {
    const page = await this.list(eq("tenantId", tenantId), {
      page: 0,
      size: 50,
      sort: { field: "createdAt", dir: "asc" },
    });
    return page.items;
  }

  async listRecentAll() {
    const page = await this.listRecent(undefined, 500);
    return page.items;
  }

  async addToApp(tenantId: bigint, rawLabel: string) {
    const slug = conversationTagSlug(rawLabel);
    if (!slug) return { error: "Use a short tag like vip or billing" };
    const label = rawLabel.trim();
    const existing = await this.list(
      and(eq("tenantId", tenantId), eq("slug", slug)),
      { page: 0, size: 1 },
    );
    if (existing.items[0]) return { row: existing.items[0] };
    const row = await this.create({ tenantId, slug, label });
    return { row };
  }

  async removeFromApp(tenantId: bigint, slug: string) {
    const page = await this.list(
      and(eq("tenantId", tenantId), eq("slug", slug)),
      { page: 0, size: 1 },
    );
    const row = page.items[0];
    if (!row) return;
    await this.delete(row.publicId);
  }
}

export const appMessageTagsService = new AppMessageTagsService(
  new UpdatableRepository(
    db,
    appMessageTags,
    appMessageTags.publicId,
    appMessageTags.id,
  ),
);
