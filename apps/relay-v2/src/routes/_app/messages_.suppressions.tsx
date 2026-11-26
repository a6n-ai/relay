import { Button } from "@foundry/ui/button";
import { TextField } from "../../components/form/text-field";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { ChoiceField } from "../../components/form/choice-field";
import { FilterMenu } from "../../components/page/filter-menu";
import { LoadMore } from "../../components/page/load-more";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { Hint } from "../../components/page/text";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { PageHeader } from "../../components/shell/page-header";
import { ResourceTable } from "../../components/resource-table";
import { useCan } from "../../components/use-can";
import { formatWhen } from "../../lib/format-date";
import { addSuppressionFn, fetchSuppressions, removeSuppressionFn } from "../../console/suppressions.fns";
import { FormError, FormBody, FormActions } from "../../components/page/form-parts";

type SuppressionsSearch = { prefix?: string; cursor?: string; stream?: StreamFilter; offset?: number };

const STREAM_FILTERS = ["all", "transactional", "tracked", "marketing"] as const;
type StreamFilter = (typeof STREAM_FILTERS)[number];
const streamLabel = (s: string) => s[0].toUpperCase() + s.slice(1);

export const Route = createFileRoute("/_app/messages_/suppressions")({
  validateSearch: (search: Record<string, unknown>): SuppressionsSearch => ({
    prefix: typeof search.prefix === "string" && search.prefix.trim() ? search.prefix.trim() : undefined,
    cursor: typeof search.cursor === "string" && search.cursor ? search.cursor : undefined,
    stream: STREAM_FILTERS.find((s) => s === search.stream),
    offset: Number.isInteger(search.offset) && (search.offset as number) > 0 ? (search.offset as number) : undefined,
  }),
  loaderDeps: ({ search }) => ({ prefix: search.prefix, cursor: search.cursor }),
  loader: ({ deps }) => fetchSuppressions({ data: deps }),
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Messages" }, { label: "Suppressions" }]} columns={4} search filter />,
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
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const canWrite = useCan({ sending: ["write"] });
  const [removing, setRemoving] = useState<string | null>(null);
  const crumbs = [{ label: "Messages" }, { label: "Suppressions" }];
  if (!page) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  async function remove(email: string) {
    await removeSuppressionFn({ data: { email } });
    toast.success("Suppression removed");
    await router.invalidate();
  }
  // The server has no stream filter, so the facet narrows the rows loaded on this page.
  const rows = search.stream ? page.rows.filter((s) => (search.stream === "all" ? !s.stream : s.stream === search.stream)) : page.rows;
  const offset = search.cursor ? (search.offset ?? 0) : 0;
  return (
    <>
      <PageHeader crumbs={crumbs} />
      <Toolbar
        search={<PrefixSearch />}
        filters={
          <FilterMenu
            facets={[{ key: "stream", label: "Stream", options: STREAM_FILTERS.map((s) => ({ value: s, label: s === "all" ? "All streams only" : streamLabel(s) })) }]}
            value={search}
            onChange={(next) => void navigate({ to: ".", search: next as never })}
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
          {search.stream === "all" ? "Showing suppressions for all streams on this page only." : `Showing ${streamLabel(search.stream)} suppressions on this page only.`}
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
          { header: "Stream", cell: (s) => (s.stream ? streamLabel(s.stream) : "All") },
          { header: "Added", kind: "time", cell: (s) => formatWhen(s.createdAt) },
        ]}
        rows={rows}
        offset={offset}
        rowKey={(s) => s.email}
        empty={search.stream && page.nextCursor ? "None on this page" : "No suppressed addresses match."}
        menu={(s) => [{ label: "Remove", onSelect: () => setRemoving(s.email), destructive: true, hidden: !canWrite || OPTED_OUT.has(s.reason) }]}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? `Remove suppression for ${removing}?` : "Remove this suppression?"}
        description="Mail to this address can be sent again."
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
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [stream, setStream] = useState<StreamFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addSuppressionFn({ data: { email, stream: stream === "all" ? undefined : stream } });
      toast.success("Suppression added");
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not add this suppression."));
    } finally {
      setPending(false);
    }
  }
  return (
    <FormBody onSubmit={submit}>
      <TextField id="sup-email" label="Email" hint="Relay will not send to this address." type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
      <ChoiceField
        id="sup-stream"
        label="Stream"
        value={stream}
        onChange={(v) => setStream(v as StreamFilter)}
        options={STREAM_FILTERS.map((s) => ({ value: s, label: s === "all" ? "All streams" : streamLabel(s) }))}
      />
      <FormError message={error} />
      <FormActions cancel submitLabel="Suppress address" pending={pending} pendingLabel="Adding…" disabled={!email.trim()} disabledReason="Enter an email first." />
    </FormBody>
  );
}
