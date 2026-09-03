import { MailboxIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter } from "@/components/ds/listing-controls";
import { listMailboxLetters } from "@/lib/mailbox/list";
import {
  groupMailboxConversations,
  indexTagsByTenantPublicId,
  tagListingFilters,
} from "@/lib/mailbox/listing";
import { loadComposeFroms } from "@/lib/mailbox/load-compose-froms";
import { appMessageTagsService } from "@/lib/services/mailbox-tags.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { MailboxCompose } from "./mailbox-compose";

export const dynamic = "force-dynamic";

const MAILBOX_FILTERS: ListingFilter[] = [
  { id: "out", label: "Relay sent" },
  { id: "in", label: "Received" },
  { id: "automatic", label: "Automatic" },
  { id: "campaign", label: "Campaigns" },
  { id: "manual", label: "Written here" },
  { id: "failed", label: "Failed" },
];

export default async function MailboxPage() {
  const [rows, froms, tagRows, { items: apps }] = await Promise.all([
    listMailboxLetters(),
    loadComposeFroms(),
    appMessageTagsService.listRecentAll(),
    tenantsService.listRecent(),
  ]);
  const appById = new Map(apps.map((a) => [a.id, a]));
  const tagsByTenant = indexTagsByTenantPublicId(
    tagRows.flatMap((t) => {
      const app = appById.get(t.tenantId);
      if (!app) return [];
      return [{ tenantPublicId: app.publicId, slug: t.slug, label: t.label }];
    }),
  );
  const items = groupMailboxConversations(rows, tagsByTenant);

  return (
    <PageShell>
      <PageHeader
        icon={MailboxIcon}
        title="Mailbox"
        subtitle="Conversations Relay sent or received. A tag on an app marks all of its messages."
        actions={<MailboxCompose froms={froms} />}
      />
      <FilteredResourceList
        title="Inbox"
        glyph="mailbox"
        emptyMessage="Nothing in the inbox yet. Compose in the top right, or wait for app mail and replies."
        searchPlaceholder="Search subject, to, or from"
        filters={[...MAILBOX_FILTERS, ...tagListingFilters(tagsByTenant)]}
        items={items}
      />
    </PageShell>
  );
}
