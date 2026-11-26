import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { LoadMore } from "../../components/page/load-more";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { PageHeader } from "../../components/shell/page-header";
import { ResourceTable } from "../../components/resource-table";
import { useCan } from "../../components/use-can";
import { formatWhen } from "../../lib/format-date";
import { addSuppressionFn, fetchSuppressions, removeSuppressionFn } from "../../console/suppressions.fns";
import { FormBody, FormActions } from "../../components/page/form-parts";

type SuppressionsSearch = { prefix?: string; cursor?: string };

export const Route = createFileRoute("/_app/messages_/suppressions")({
  validateSearch: (search: Record<string, unknown>): SuppressionsSearch => ({
    prefix: typeof search.prefix === "string" && search.prefix.trim() ? search.prefix.trim() : undefined,
    cursor: typeof search.cursor === "string" && search.cursor ? search.cursor : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchSuppressions({ data: deps }),
  pendingComponent: () => <TableSkeleton columns={4} />,
  component: SuppressionsPage,
});

const REASON_LABEL: Record<string, string> = {
  unsubscribe: "Unsubscribed",
  bounce: "Bounced",
  complaint: "Complaint",
  manual: "Added manually",
};
const OPTED_OUT = new Set(["unsubscribe", "complaint"]);
const STREAMS = ["transactional", "tracked", "marketing"] as const;

function SuppressionsPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
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
  return (
    <>
      <PageHeader crumbs={crumbs} />
      <Toolbar search={<PrefixSearch />}>
        {canWrite ? (
          <CreateDialog trigger="Suppress address" title="Suppress an address">
            {(done) => <AddForm done={done} />}
          </CreateDialog>
        ) : null}
      </Toolbar>
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
          { header: "Stream", cell: (s) => (s.stream ? s.stream[0].toUpperCase() + s.stream.slice(1) : "All") },
          { header: "Added", kind: "time", cell: (s) => formatWhen(s.createdAt) },
        ]}
        rows={page.rows}
        rowKey={(s) => s.email}
        empty="No suppressed addresses match."
        menu={(s) => [{ label: "Remove", onSelect: () => setRemoving(s.email), destructive: true, hidden: !canWrite || OPTED_OUT.has(s.reason) }]}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Remove this suppression?"
        description="Mail to this address can be sent again."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (removing) await remove(removing);
        }}
      />
      <LoadMore
        hasMore={Boolean(page.nextCursor)}
        to="/messages/suppressions"
        search={{ prefix: search.prefix, cursor: page.nextCursor }}
        resetTo={search.cursor ? "/messages/suppressions" : undefined}
        resetSearch={{ prefix: search.prefix }}
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
  const [stream, setStream] = useState<"all" | (typeof STREAMS)[number]>("all");
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
      <Label htmlFor="sup-email">Email</Label>
      <Input id="sup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Label htmlFor="sup-stream">Stream</Label>
      <Select value={stream} onValueChange={(v) => setStream(v as "all" | (typeof STREAMS)[number])}>
        <SelectTrigger id="sup-stream">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All streams</SelectItem>
          {STREAMS.map((s) => (
            <SelectItem key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FormError message={error} />
      <FormActions>
        <Button type="submit" disabled={pending || !email.trim()}>
          Add suppression
        </Button>
      </FormActions>
    </FormBody>
  );
}
