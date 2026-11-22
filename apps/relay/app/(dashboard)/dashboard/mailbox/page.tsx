import { MailboxIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { EmptyState } from "@/components/ds/empty-state";
import { ListingTable, type ListingFilter } from "@/components/ds/listing-table";
import { NoticeBar } from "@/components/ds/notice-bar";
import { countInboundFailures, listInboundFailures } from "@/lib/mailbox/failures";
import { listMailboxLetters } from "@/lib/mailbox/list";
import { mailboxScope } from "@/lib/mailbox/scope";
import {
  groupMailboxConversations,
  indexTagsByTenantPublicId,
  tagListingFilters,
} from "@/lib/mailbox/listing";
import { resolveActiveApp } from "@/lib/apps/active-app";
import { loadComposeFroms } from "@/lib/mailbox/load-compose-froms";
import { appMessageTagsService } from "@/lib/services/mailbox-tags.service";
import { MailboxCompose } from "./mailbox-compose";
import { ViewHeader } from "@/components/ds/view-header";
import { MailboxFailureActions } from "./mailbox-failure-actions";
import { requirePagePermission } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export const metadata = { title: "Inbox" };

const MAILBOX_FILTERS: ListingFilter[] = [
  { id: "out", label: "Relay sent" },
  { id: "in", label: "Received" },
  { id: "automatic", label: "Automatic" },
  { id: "campaign", label: "Campaigns" },
  { id: "manual", label: "Written here" },
  { id: "failed", label: "Failed" },
];

export default async function MailboxPage() {
  await requirePagePermission({ mailbox: ["read"] });
  const scope = await mailboxScope({ onMissing: "redirect" });
  const activeApp = await resolveActiveApp();
  const [rows, froms, tagRows, failures, failureCount] = await Promise.all([
    listMailboxLetters(scope, { tenantId: activeApp?.id }),
    loadComposeFroms(),
    activeApp ? appMessageTagsService.forTenant(activeApp.id) : Promise.resolve([]),
    listInboundFailures(scope),
    countInboundFailures(scope),
  ]);
  const tagsByTenant = indexTagsByTenantPublicId(
    activeApp
      ? tagRows.map((t) => ({
          tenantPublicId: activeApp.publicId,
          slug: t.slug,
          label: t.label,
        }))
      : [],
  );
  const items = groupMailboxConversations(rows, tagsByTenant);

  return (
    <PageShell>
      <ViewHeader
        title="Inbox"
        subtitle={
          activeApp
            ? `Conversations for ${activeApp.name}. Switch apps in the sidebar to change focus.`
            : "Create an app to start receiving and sending from this workspace."
        }
        actions={activeApp ? <MailboxCompose froms={froms} /> : undefined}
      />
      {failureCount > 0 ? (
        <div className="flex flex-col gap-2">
          <NoticeBar
            message={`${failureCount} ${failureCount === 1 ? "email" : "emails"} could not be read`}
          />
          {failures.map((failure) => (
            <NoticeBar
              key={failure.publicId}
              message={`From ${failure.envelopeFrom} · ${new Date(failure.receivedAt).toLocaleString()}`}
              actions={<MailboxFailureActions publicId={failure.publicId} />}
            />
          ))}
        </div>
      ) : null}
      <ListingTable
        title="Inbox"
        empty={
          <EmptyState
            icon={MailboxIcon}
            title={activeApp ? "Your inbox is empty" : "Start by creating an app"}
            lines={
              activeApp
                ? [
                    "Mail this app sends and the replies people write show up here.",
                    "You can also write the first letter yourself.",
                  ]
                : [
                    "Inbox follows the app you pick in the sidebar.",
                    "Add an app, then come back to send and receive.",
                  ]
            }
            action={activeApp ? <MailboxCompose froms={froms} pill /> : undefined}
            docsHref="/docs"
          />
        }
        searchPlaceholder="Search subject, to, or from"
        filters={[...MAILBOX_FILTERS, ...tagListingFilters(tagsByTenant)]}
        items={items}
      />
    </PageShell>
  );
}
