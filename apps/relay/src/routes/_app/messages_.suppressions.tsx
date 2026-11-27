import { confirmAction } from "../../components/lib/run-action";
import { TextField } from "../../components/form/text-field";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/page/confirm-dialog";
import { CreateDialog } from "../../components/page/create-dialog";
import { PageDenied } from "../../components/page/page-denied";
import { ChoiceField } from "../../components/form/choice-field";
import { FilterMenu } from "../../components/page/filter-menu";
import { LoadMore } from "../../components/page/load-more";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { Hint } from "../../components/form/text";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { PageHeader } from "../../components/shell/page-header";
import { ResourceTable } from "../../components/page/resource-table";
import { useCan } from "../../components/lib/use-can";
import { formatWhen } from "../../components/lib/format-date";
import { addSuppressionFn, fetchSuppressions, removeSuppressionFn } from "../../console/suppressions.fns";
import { FormError, FormBody, FormActions } from "../../components/form/form-parts";
import { STREAMS, type SuppressionReason } from "../../shared/mail";
import { oneOf, posInt, str, trimmed, untyped } from "../../components/lib/route-search";
import { useSubmit } from "../../components/lib/use-submit";

type Blocked = { email: string; reason: SuppressionReason };
type SuppressionsSearch = { prefix?: string; cursor?: string; stream?: StreamFilter; offset?: number };

const STREAM_FILTERS = ["all", ...STREAMS] as const;
type StreamFilter = (typeof STREAM_FILTERS)[number];
const STREAM_LABEL: Record<StreamFilter, string> = { all: "All mail", transactional: "Receipts and alerts", tracked: "Tracked mail", marketing: "Campaigns" };
const streamLabel = (s: string) => STREAM_LABEL[s as StreamFilter] ?? s;

export const Route = createFileRoute("/_app/messages_/suppressions")({
  staticData: { title: "Suppressed", copy: "Addresses Relay will not send to." },
  validateSearch: (search: Record<string, unknown>): SuppressionsSearch => ({
    prefix: trimmed(search.prefix),
    cursor: str(search.cursor),
    stream: oneOf(STREAM_FILTERS, search.stream),
    offset: posInt(search.offset),
  }),
  loaderDeps: ({ search }) => ({ prefix: search.prefix, cursor: search.cursor }),
  loader: ({ deps }) => fetchSuppressions({ data: deps }),
  pendingComponent: () => <ListSkeleton columns={4} search filter />,
  component: SuppressionsPage,
});

const REASON_LABEL: Record<string, string> = {
  unsubscribe: "Unsubscribed",
  bounce: "Bounced",
  complaint: "Complaint",
  manual: "Added manually",
};
const OPTED_OUT = new Set(["unsubscribe", "complaint"]);

function SuppressionsPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const canWrite = useCan({ sending: ["write"] });
  const [removing, setRemoving] = useState<Blocked | null>(null);
  if (!page) {
    return <PageDenied />;
  }
  async function remove({ email, reason }: Blocked) {
    await confirmAction(() => removeSuppressionFn({ data: { email, reason } }), "Suppression removed", () => router.invalidate());
  }
  // The server has no stream filter, so the facet narrows the rows loaded on this page.
  const rows = search.stream ? page.rows.filter((s) => (search.stream === "all" ? !s.stream : s.stream === search.stream)) : page.rows;
  const offset = search.cursor ? (search.offset ?? 0) : 0;
  return (
    <>
      <PageHeader />
      <Toolbar
        search={<PrefixSearch />}
        filters={
          <FilterMenu
            facets={[{ key: "stream", label: "Applies to", options: STREAM_FILTERS.map((s) => ({ value: s, label: streamLabel(s) })) }]}
            value={search}
            onChange={(next) => void navigate({ to: ".", search: untyped(next) })}
          />
        }
      >
        {canWrite ? (
          <CreateDialog trigger="Suppress address" title="Suppress address">
            {(done) => <AddForm done={done} />}
          </CreateDialog>
        ) : null}
      </Toolbar>
      {search.stream ? (
        <Hint>
          Showing {streamLabel(search.stream)} suppressions on this page only.
          {page.nextCursor ? " Use Show older to see more." : null}
        </Hint>
      ) : null}
      <ResourceTable
        columns={[
          { header: "Email", cell: (s) => s.email },
          {
            header: "Reason",
            cell: (s) => (
              <>
                {REASON_LABEL[s.reason] ?? s.reason}
                {OPTED_OUT.has(s.reason) ? <span className="ml-2 text-muted-foreground">Opted out</span> : null}
              </>
            ),
          },
          { header: "Applies to", secondary: true, cell: (s) => (s.stream ? streamLabel(s.stream) : "All mail") },
          { header: "Added", secondary: true, kind: "time", cell: (s) => formatWhen(s.createdAt) },
        ]}
        rows={rows}
        offset={offset}
        rowKey={(s) => `${s.email}:${s.reason}`}
        empty={search.stream && page.nextCursor ? "None on this page" : "No suppressed addresses match."}
        menu={(s) => [{ label: "Remove", onSelect: () => setRemoving(s), destructive: true, hidden: !canWrite || OPTED_OUT.has(s.reason) }]}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? `Remove suppression for ${removing.email}?` : "Remove this suppression?"}
        description="Mail to this address can be sent again unless another block still applies."
        confirmLabel="Remove suppression"
        onConfirm={async () => {
          if (removing) await remove(removing);
        }}
      />
      <LoadMore
        hasMore={Boolean(page.nextCursor)}
        to="/messages/suppressions"
        search={{ prefix: search.prefix, stream: search.stream, cursor: page.nextCursor }}
        resetTo={search.cursor ? "/messages/suppressions" : undefined}
        resetSearch={{ prefix: search.prefix, stream: search.stream }}
        offset={offset}
        pageSize={page.rows.length}
      />
    </>
  );
}

function PrefixSearch() {
  const [value, setValue] = useUrlFilter("prefix", { resetCursor: true });
  return <SearchInput value={value} onChange={setValue} placeholder="Email starts with" />;
}

function AddForm({ done }: { done: () => void }) {
  const [email, setEmail] = useState("");
  const [stream, setStream] = useState<StreamFilter>("all");
  const { pending, error, run } = useSubmit();
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await addSuppressionFn({ data: { email, stream: stream === "all" ? undefined : stream } });
    }, "Could not add this suppression.", { success: "Suppression added", after: done });
  }
  return (
    <FormBody onSubmit={submit}>
      <TextField id="sup-email" label="Email" hint="Relay will not send to this address." type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
      <ChoiceField
        id="sup-stream"
        label="Applies to"
        value={stream}
        onChange={(v) => setStream(v as StreamFilter)}
        options={STREAM_FILTERS.map((s) => ({ value: s, label: streamLabel(s) }))}
      />
      <FormError message={error} />
      <FormActions cancel submitLabel="Suppress address" pending={pending} pendingLabel="Adding…" disabled={!email.trim()} disabledReason="Enter an email first." />
    </FormBody>
  );
}
