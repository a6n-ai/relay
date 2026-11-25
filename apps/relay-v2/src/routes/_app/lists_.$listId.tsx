import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { FileUpload, FileUploadDropzone, FileUploadTrigger } from "@foundry/ui/file-upload";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { CellWhen, ResourceTable } from "../../components/resource-table";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { LoadMore } from "../../components/page/load-more";
import { EmptyState } from "../../components/page/empty-state";
import { RowMenu } from "../../components/page/row-menu";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { PageHeader } from "../../components/shell/page-header";
import { formatDate, formatWhen } from "../../lib/format-date";
import {
  addMemberFn,
  deleteListFn,
  fetchListMembers,
  fetchLists,
  importCsvFn,
  removeMemberFn,
  updateListFn,
} from "../../console/lists.fns";

type ListSearch = { appId?: string; cursor?: string };

const MAX_CSV_BYTES = 2_000_000;

// The list name comes from the app's list index, so the link carries appId.
export const Route = createFileRoute("/_app/lists_/$listId")({
  validateSearch: (search: Record<string, unknown>): ListSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
    cursor: typeof search.cursor === "string" && search.cursor ? search.cursor : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps, params }) => {
    const lists = deps.appId ? await fetchLists({ data: { appId: deps.appId } }) : [];
    const members = await fetchListMembers({ data: { listId: params.listId, cursor: deps.cursor } });
    if (!lists || !members) return null;
    if ("missing" in members) return { missing: true as const };
    return { list: "missing" in lists ? undefined : lists.find((l) => l.id === params.listId), members };
  },
  pendingComponent: () => <TableSkeleton columns={5} />,
  component: ListDetailPage,
});

function ListDetailPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const { listId } = Route.useParams();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const canWrite = useCan({ list: ["write"] });
  const canImport = useCan({ list: ["import"] });
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const listsCrumb = { label: "Lists", to: "/lists", search: { appId: search.appId } };
  if (!page) {
    return (
      <>
        <PageHeader crumbs={[listsCrumb, { label: "List" }]} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in page || !page.list) {
    return (
      <>
        <PageHeader crumbs={[listsCrumb, { label: "List" }]} />
        <DeniedState reason="not-found" label="List not found" />
      </>
    );
  }
  const { list, members } = page;
  async function remove(memberId: string) {
    try {
      await removeMemberFn({ data: { listId, memberId } });
      toast.success("Contact removed");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not remove this contact."));
    }
  }
  async function deleteList() {
    try {
      await deleteListFn({ data: { id: listId } });
      toast.success("List deleted");
      await navigate({ to: "/lists", search: { appId: list.appId } });
    } catch (err) {
      toast.error(errorText(err, "Could not delete this list."));
    }
  }
  const q = query.trim().toLowerCase();
  const shown = q
    ? members.rows.filter((m) => `${m.email} ${m.firstName ?? ""} ${m.lastName ?? ""}`.toLowerCase().includes(q))
    : members.rows;
  const empty = (
    <EmptyState
      icon={UsersIcon}
      title={q ? "No contacts match" : "No contacts on this list yet."}
      action={
        !q && (canWrite || canImport) ? (
          <div className="flex gap-2">
            {canWrite ? (
              <CreateDialog trigger="Add contact" title="Add contact">
                {(done) => <AddContactForm listId={listId} done={done} />}
              </CreateDialog>
            ) : null}
            {canImport ? (
              <CreateDialog trigger="Import CSV" title="Import contacts">
                {(done) => <ImportForm listId={listId} done={done} />}
              </CreateDialog>
            ) : null}
          </div>
        ) : undefined
      }
    />
  );
  return (
    <>
      <PageHeader crumbs={[listsCrumb, { label: list.name }]} />
      <Toolbar search={<SearchInput value={query} onChange={setQuery} placeholder="Search contacts" />}>
        {canImport ? (
          <Button variant="outline" size="sm" className="rounded-full" render={<a href={`/lists/${listId}/export`} download />}>
            Export CSV
          </Button>
        ) : null}
        {canImport ? (
          <CreateDialog trigger="Import CSV" title="Import contacts">
            {(done) => <ImportForm listId={listId} done={done} />}
          </CreateDialog>
        ) : null}
        {canWrite ? (
          <CreateDialog trigger="Add contact" title="Add contact">
            {(done) => <AddContactForm listId={listId} done={done} />}
          </CreateDialog>
        ) : null}
        {canWrite ? (
          <RowMenu
            label="List actions"
            actions={[
              { label: "Rename", onSelect: () => setRenaming(true) },
              { label: "Delete", destructive: true, onSelect: () => setDeleting(true) },
            ]}
          />
        ) : null}
      </Toolbar>
      <CreateDialog title="Rename list" open={renaming} onOpenChange={setRenaming}>
        {(done) => <RenameForm listId={listId} name={list.name} done={done} />}
      </CreateDialog>
      <ConfirmDialog
        title="Delete this list?"
        description="The list and its contacts will be removed."
        confirmLabel="Delete"
        open={deleting}
        onOpenChange={setDeleting}
        onConfirm={deleteList}
      />
      <ConfirmDialog
        title="Remove this contact?"
        description="They leave this list. Mail to them is not affected."
        confirmLabel="Remove"
        open={removing !== null}
        onOpenChange={(o) => {
          if (!o) setRemoving(null);
        }}
        onConfirm={() => {
          if (removing) void remove(removing);
        }}
      />
      <ResourceTable
        columns={[
          { header: "Email", cell: (m) => m.email },
          { header: "Name", cell: (m) => [m.firstName, m.lastName].filter(Boolean).join(" ") || "—" },
          { header: "Source", cell: (m) => (m.source === "import" ? "Import" : "Manual") },
          { header: "Added", cell: (m) => <CellWhen when={formatDate(m.createdAt)} text={formatWhen(m.createdAt)} /> },
          {
            header: "Status",
            cell: (m) => (
              <div className="flex flex-wrap gap-1">
                <StatusBadge status={m.state} />
                {m.optedOut.map((domain) => (
                  <Badge key={domain} variant="outline">
                    Opted out: {domain}
                  </Badge>
                ))}
              </div>
            ),
          },
        ]}
        rows={shown}
        rowKey={(m) => m.id}
        menu={canWrite ? (m) => [{ label: "Remove", destructive: true, onSelect: () => setRemoving(m.id) }] : undefined}
        empty={empty}
      />
      <LoadMore
        hasMore={!!members.nextCursor}
        to={`/lists/${listId}`}
        search={{ appId: search.appId, cursor: members.nextCursor }}
      />
    </>
  );
}

function RenameForm({ listId, name, done }: { listId: string; name: string; done: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await updateListFn({ data: { id: listId, patch: { name: value } } });
      toast.success("List renamed");
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not rename this list."));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="list-rename">Name</Label>
      <Input id="list-rename" required value={value} onChange={(e) => setValue(e.target.value)} />
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !value.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

function AddContactForm({ listId, done }: { listId: string; done: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addMemberFn({
        data: {
          listId,
          member: { email, firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined },
        },
      });
      toast.success("Contact added");
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not add this contact."));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="contact-email">Email</Label>
      <Input id="contact-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Label htmlFor="contact-first">First name</Label>
      <Input id="contact-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      <Label htmlFor="contact-last">Last name</Label>
      <Input id="contact-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !email.trim()}>
          Add
        </Button>
      </div>
    </form>
  );
}

function ImportForm({ listId, done }: { listId: string; done: () => void }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof importCsvFn>> | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const file = files[0];
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const counts = await importCsvFn({ data: { listId, csv: await file.text() } });
      setResult(counts ?? null);
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not import this file."));
    } finally {
      setPending(false);
    }
  }
  if (result) {
    return (
      <div className="grid gap-3">
        <p className="text-sm tabular-nums">
          Added {result.added} · Already on list {result.existing} · Suppressed {result.suppressed} · Invalid{" "}
          {result.invalid} · Duplicates {result.duplicates}
        </p>
        <div className="flex justify-end">
          <Button onClick={done}>Done</Button>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <FileUpload
        accept=".csv,text/csv"
        maxFiles={1}
        maxSize={MAX_CSV_BYTES}
        value={files}
        onValueChange={setFiles}
        onFileReject={(_, message) => setError(message)}
        label="CSV file"
      >
        <FileUploadDropzone className="gap-2 text-sm text-muted-foreground">
          <span>Drop a .csv file here, up to 2 MB</span>
          <FileUploadTrigger>Choose file</FileUploadTrigger>
        </FileUploadDropzone>
      </FileUpload>
      <p className="text-xs text-muted-foreground">
        Columns: email, first_name, last_name, name, consent_at. The email column is required.
      </p>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || files.length === 0}>
          Import
        </Button>
      </div>
    </form>
  );
}
