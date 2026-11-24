import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { formatWhen } from "../../components/event-timeline";
import { FormError } from "../../components/form-error";
import { MessagesTabs } from "../../components/messages-tabs";
import { ResourceTable } from "../../components/resource-table";
import { useCan } from "../../components/use-can";
import { ViewHeader } from "../../components/view-header";
import { addSuppressionFn, fetchSuppressions, removeSuppressionFn } from "../../console/suppressions.fns";

type SuppressionsSearch = { prefix?: string; cursor?: string };

export const Route = createFileRoute("/_app/messages_/suppressions")({
  validateSearch: (search: Record<string, unknown>): SuppressionsSearch => ({
    prefix: typeof search.prefix === "string" && search.prefix.trim() ? search.prefix.trim() : undefined,
    cursor: typeof search.cursor === "string" && search.cursor ? search.cursor : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchSuppressions({ data: deps }),
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
  if (!page) {
    return (
      <>
        <ViewHeader title="Suppressions" />
        <MessagesTabs active="suppressions" />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  async function remove(email: string) {
    try {
      await removeSuppressionFn({ data: { email } });
      toast.success("Suppression removed");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not remove this suppression."));
    }
  }
  return (
    <>
      <ViewHeader
        title="Suppressions"
        actions={
          canWrite ? (
            <CreateDialog trigger="Add" title="Suppress an address">
              {(done) => <AddForm done={done} />}
            </CreateDialog>
          ) : undefined
        }
      />
      <MessagesTabs active="suppressions" />
      <div className="grid gap-4 p-4">
        <PrefixSearch prefix={search.prefix} />
        <ResourceTable
          columns={[
            { header: "Email", cell: (s) => s.email },
            { header: "Reason", cell: (s) => REASON_LABEL[s.reason] ?? s.reason },
            {
              header: "Stream",
              cell: (s) => (s.stream ? s.stream[0].toUpperCase() + s.stream.slice(1) : "All"),
            },
            { header: "Added", cell: (s) => <span className="text-xs tabular-nums">{formatWhen(s.createdAt)}</span> },
            {
              header: "",
              cell: (s) => {
                if (OPTED_OUT.has(s.reason)) return <span className="text-muted-foreground">Opted out</span>;
                if (!canWrite) return null;
                return (
                  <ConfirmDialog
                    trigger="Remove"
                    title="Remove this suppression?"
                    description="Mail to this address can be sent again."
                    confirmLabel="Remove"
                    onConfirm={() => remove(s.email)}
                  />
                );
              },
            },
          ]}
          rows={page.rows}
          rowKey={(s) => s.email}
          empty="No suppressed addresses match."
        />
        <nav aria-label="Pages" className="flex justify-between text-sm">
          {search.cursor ? (
            <Link to="/messages/suppressions" search={{ prefix: search.prefix }} className="hover:underline">
              First page
            </Link>
          ) : (
            <span />
          )}
          {page.nextCursor ? (
            <Link
              to="/messages/suppressions"
              search={{ prefix: search.prefix, cursor: page.nextCursor }}
              className="hover:underline"
            >
              Next
            </Link>
          ) : null}
        </nav>
      </div>
    </>
  );
}

// Applies by navigating, so the list reloads from the server with the new prefix and no cursor.
function PrefixSearch({ prefix }: { prefix?: string }) {
  const navigate = useNavigate({ from: "/messages/suppressions" });
  const [value, setValue] = useState(prefix ?? "");
  function apply(event: FormEvent) {
    event.preventDefault();
    navigate({ to: "/messages/suppressions", search: { prefix: value.trim() || undefined } });
  }
  return (
    <form onSubmit={apply} className="grid gap-1.5 sm:max-w-sm">
      <Label htmlFor="sup-prefix">Email starts with</Label>
      <div className="flex gap-2">
        <Input id="sup-prefix" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </div>
    </form>
  );
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
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="sup-email">Email</Label>
      <Input id="sup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Label htmlFor="sup-stream">Stream</Label>
      <Select value={stream} onValueChange={(v) => setStream(v as "all" | (typeof STREAMS)[number])}>
        <SelectTrigger id="sup-stream" className="w-full">
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
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !email.trim()}>
          Add
        </Button>
      </div>
    </form>
  );
}
