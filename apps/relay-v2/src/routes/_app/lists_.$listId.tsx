import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { FileUpload, FileUploadDropzone, FileUploadTrigger } from "@foundry/ui/file-upload";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { formatWhen } from "../../components/event-timeline";
import { FormError } from "../../components/form-error";
import { ResourceTable } from "../../components/resource-table";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { ViewHeader } from "../../components/view-header";
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
    return { list: lists.find((l) => l.id === params.listId), members };
  },
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
  if (!page) {
    return (
      <>
        <ViewHeader title="List" />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if (!page.list) {
    return (
      <>
        <ViewHeader title="List" />
        <DeniedState reason="not-found" />
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
  return (
    <>
      <ViewHeader
        title={list.name}
        actions={
          canWrite ? (
            <div className="flex gap-2">
              <CreateDialog trigger="Rename" title="Rename list">
                {(done) => <RenameForm listId={listId} name={list.name} done={done} />}
              </CreateDialog>
              <ConfirmDialog
                trigger="Delete"
                title="Delete this list?"
                description="The list and its contacts will be removed."
                confirmLabel="Delete"
                onConfirm={deleteList}
              />
            </div>
          ) : undefined
        }
      />
      <div className="grid gap-4 p-4">
        {canWrite || canImport ? (
          <div className="flex justify-end gap-2">
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
        ) : null}
        <ResourceTable
          columns={[
            { header: "Email", cell: (m) => m.email },
            { header: "Name", cell: (m) => [m.firstName, m.lastName].filter(Boolean).join(" ") },
            { header: "Source", cell: (m) => (m.source === "import" ? "Import" : "Manual") },
            { header: "Added", cell: (m) => <span className="text-xs tabular-nums">{formatWhen(m.createdAt)}</span> },
            { header: "Status", cell: (m) => <StatusBadge status={m.state} /> },
            {
              header: "",
              cell: (m) =>
                canWrite ? (
                  <ConfirmDialog
                    trigger="Remove"
                    title="Remove this contact?"
                    description="They leave this list. Mail to them is not affected."
                    confirmLabel="Remove"
                    onConfirm={() => remove(m.id)}
                  />
                ) : null,
            },
          ]}
          rows={members.rows}
          rowKey={(m) => m.id}
          empty="No contacts on this list yet."
        />
        <nav aria-label="Pages" className="flex justify-between text-sm">
          {search.cursor ? (
            <Link to="/lists/$listId" params={{ listId }} search={{ appId: search.appId }} className="hover:underline">
              Newest
            </Link>
          ) : (
            <span />
          )}
          {members.nextCursor ? (
            <Link
              to="/lists/$listId"
              params={{ listId }}
              search={{ appId: search.appId, cursor: members.nextCursor }}
              className="hover:underline"
            >
              Older
            </Link>
          ) : null}
        </nav>
      </div>
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
