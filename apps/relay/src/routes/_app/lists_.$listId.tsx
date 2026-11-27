import { Badge } from "@foundry/ui/badge";
import { NameField, TextField } from "../../components/form/text-field";
import { Button } from "@foundry/ui/button";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConsentFields } from "../../components/lists/consent-fields";
import { consentHint } from "../../components/lists/consent-labels";
import { FixedField } from "../../components/form/fixed-field";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { CellWhen, ResourceTable } from "../../components/resource-table";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { LoadMore } from "../../components/page/load-more";
import { EmptyState } from "../../components/page/empty-state";
import { RowMenu } from "../../components/page/row-menu";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { PageHeader } from "../../components/shell/page-header";
import { fetchApps } from "../../console/apps.fns";
import { formatDate, formatWhen } from "../../lib/format-date";
import {
  addMemberFn,
  deleteListFn,
  fetchListMembers,
  updateContactFn,
  fetchLists,
  removeMemberFn,
  updateListFn,
} from "../../console/lists.fns";
import { FormError, FormBody, FormActions } from "../../components/page/form-parts";
import { type ConsentSource, type MemberView } from "../../shared/views";
import { str, posInt } from "../../lib/route-search";

type ListSearch = { appId?: string; cursor?: string; q?: string; offset?: number };

export const Route = createFileRoute("/_app/lists_/$listId")({
  validateSearch: (search: Record<string, unknown>): ListSearch => ({
    appId: str(search.appId),
    cursor: str(search.cursor),
    q: str(search.q),
    offset: posInt(search.offset),
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId, cursor: search.cursor }),
  loader: async ({ deps, params }) => {
    const lists = deps.appId ? await fetchLists({ data: { appId: deps.appId } }) : [];
    const apps = await fetchApps();
    const members = await fetchListMembers({ data: { listId: params.listId, cursor: deps.cursor } });
    if (!lists || !members) return null;
    if ("missing" in members) return { missing: true as const };
    return { list: "missing" in lists ? undefined : lists.find((l) => l.id === params.listId), members, appName: apps?.find((a) => a.id === deps.appId)?.name };
  },
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Lists", to: "/lists" }, { label: "List" }]} columns={5} search action />,
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
  const [query, setQuery] = useUrlFilter("q");
  const [editing, setEditing] = useState(false);
  const [editingContact, setEditingContact] = useState<MemberView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; email: string } | null>(null);
  const [adding, setAdding] = useState(false);
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
  const { list, members, appName } = page;
  const offset = search.cursor ? (search.offset ?? 0) : 0;
  async function remove(memberId: string) {
    await removeMemberFn({ data: { listId, memberId } });
    toast.success("Contact removed");
    await router.invalidate();
  }
  async function deleteList() {
    await deleteListFn({ data: { id: listId } });
    toast.success("List deleted");
    await navigate({ to: "/lists", search: { appId: list.appId } });
  }
  const q = query.trim().toLowerCase();
  const shown = q
    ? members.rows.filter((m) => `${m.email} ${m.firstName ?? ""} ${m.lastName ?? ""}`.toLowerCase().includes(q))
    : members.rows;
  const empty = (
    <EmptyState
      icon={UsersIcon}
      title={q ? "No contacts match" : "No contacts yet"}
      description={q ? "Try a different email or name." : "Add contacts one at a time or import a CSV."}
      action={
        !q && (canWrite || canImport) ? (
          <div className="flex gap-2">
            {canImport ? (
              <Button variant="outline" render={<Link to="/lists/$listId/import" params={{ listId }} search={{ appId: search.appId }} />}>
                Import contacts
              </Button>
            ) : null}
            {canWrite ? (
              <Button variant="outline" onClick={() => setAdding(true)}>
                Add contact
              </Button>
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
          <Button variant="outline" render={<a href={`/lists/${listId}/export`} download />}>
            Export CSV
          </Button>
        ) : null}
        {canImport ? (
          <Button variant="outline" render={<Link to="/lists/$listId/import" params={{ listId }} search={{ appId: search.appId }} />}>
            Import contacts
          </Button>
        ) : null}
        {canWrite ? (
          <Button onClick={() => setAdding(true)}>
            Add contact
          </Button>
        ) : null}
        {canWrite ? (
          <RowMenu
            label="List actions"
            actions={[
              { label: "Edit list", onSelect: () => setEditing(true) },
              { label: "Delete", destructive: true, onSelect: () => setDeleting(true) },
            ]}
          />
        ) : null}
      </Toolbar>
      {canWrite ? (
        <CreateDialog title="Add contact" open={adding} onOpenChange={setAdding}>
          {(done) => <AddContactForm listId={listId} consent={list.consentSource} done={done} />}
        </CreateDialog>
      ) : null}
      <CreateDialog title="Edit list" open={editing} onOpenChange={setEditing}>
        {(done) => <EditListForm list={list} appName={appName} done={done} />}
      </CreateDialog>
      <CreateDialog title="Edit contact" open={editingContact !== null} onOpenChange={(o) => !o && setEditingContact(null)}>
        {(done) => (editingContact ? <EditContactForm key={editingContact.id} listId={listId} member={editingContact} done={done} /> : null)}
      </CreateDialog>
      <ConfirmDialog
        title={`Delete ${list.name}?`}
        description={`${list.members} ${list.members === 1 ? "contact" : "contacts"} will be removed from it. Campaigns that use this list will no longer send to it.`}
        confirmLabel="Delete list"
        open={deleting}
        onOpenChange={setDeleting}
        onConfirm={deleteList}
      />
      <ConfirmDialog
        title={removing ? `Remove ${removing.email}?` : "Remove this contact?"}
        description="They leave this list. Mail to them is not affected."
        confirmLabel="Remove contact"
        open={removing !== null}
        onOpenChange={(o) => {
          if (!o) setRemoving(null);
        }}
        onConfirm={async () => {
          if (removing) await remove(removing.id);
        }}
      />
      <ResourceTable
        columns={[
          { header: "Email", cell: (m) => m.email },
          { header: "Name", cell: (m) => [m.firstName, m.lastName].filter(Boolean).join(" ") || "—" },
          { header: "Source", secondary: true, cell: (m) => (m.source === "import" ? "Import" : "Manual") },
          { header: "Added", secondary: true, cell: (m) => <CellWhen when={formatDate(m.createdAt)} text={formatWhen(m.createdAt)} /> },
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
        offset={offset}
        menu={
          canWrite
            ? (m) => [
                { label: "Edit contact", onSelect: () => setEditingContact(m) },
                { label: "Remove contact", destructive: true, onSelect: () => setRemoving({ id: m.id, email: m.email }) },
              ]
            : undefined
        }
        empty={empty}
      />
      <LoadMore
        hasMore={!!members.nextCursor}
        to={`/lists/${listId}`}
        search={{ appId: search.appId, q: search.q, cursor: members.nextCursor }}
        resetTo={search.cursor ? `/lists/${listId}` : undefined}
        resetSearch={{ appId: search.appId, q: search.q }}
        offset={offset}
        pageSize={members.rows.length}
      />
    </>
  );
}

function EditListForm({
  list,
  appName,
  done,
}: {
  list: { id: string; name: string; consentSource: ConsentSource; consentNote: string | null };
  appName?: string;
  done: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(list.name);
  const [consent, setConsent] = useState(list.consentSource);
  const [note, setNote] = useState(list.consentNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = name !== list.name || consent !== list.consentSource || note.trim() !== (list.consentNote ?? "");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      // An empty note clears it: the server keeps the old note only when consentNote is omitted.
      await updateListFn({ data: { id: list.id, patch: { name, consentSource: consent, consentNote: note.trim() } } });
      toast.success("List updated");
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not update this list."));
    } finally {
      setPending(false);
    }
  }
  return (
    <FormBody onSubmit={submit}>
      <FixedField label="App" value={appName ?? "This list's app"} hint="Create a new list in the other app instead." />
      <NameField id="list-rename" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <ConsentFields idPrefix="list-edit" consent={consent} onConsent={setConsent} note={note} onNote={setNote} />
      <FormError message={error} />
      <FormActions
        cancel
        submitLabel="Save list"
        pending={pending}
        pendingLabel="Saving…"
        disabled={!dirty || !name.trim()}
        disabledReason={name.trim() ? "Change something to save." : "Enter a name first."}
      />
    </FormBody>
  );
}

function EditContactForm({ listId, member, done }: { listId: string; member: MemberView; done: () => void }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(member.firstName ?? "");
  const [lastName, setLastName] = useState(member.lastName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = firstName.trim() !== (member.firstName ?? "") || lastName.trim() !== (member.lastName ?? "");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await updateContactFn({ data: { listId, contactId: member.id, firstName, lastName } });
      toast.success("Contact updated");
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not update this contact."));
    } finally {
      setPending(false);
    }
  }
  return (
    <FormBody onSubmit={submit}>
      <FixedField label="Email" value={member.email} hint="Remove this contact and add the new address instead." />
      <div className="grid grid-cols-2 gap-3">
        <TextField id="contact-edit-first" label="First name" autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <TextField id="contact-edit-last" label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>
      <FormError message={error} />
      <FormActions cancel submitLabel="Save contact" pending={pending} pendingLabel="Saving…" disabled={!dirty} disabledReason="Change a name to save." />
    </FormBody>
  );
}

function AddContactForm({ listId, consent, done }: { listId: string; consent: ConsentSource; done: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [named, setNamed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setEmailError("Enter a valid email address.");
      return;
    }
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
    <FormBody onSubmit={submit}>
      <TextField
        id="contact-email"
        label="Email"
        hint={consentHint(consent)}
        type="email"
        autoFocus
        required
        value={email}
        error={emailError}
        onClearError={() => setEmailError(null)}
        onChange={(e) => setEmail(e.target.value)}
      />
      {named ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField id="contact-first" label="First name (optional)" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <TextField id="contact-last" label="Last name (optional)" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      ) : (
        <div>
          <Button type="button" variant="link" className="px-0" onClick={() => setNamed(true)}>
            Add a name
          </Button>
        </div>
      )}
      <FormError message={error} />
      <FormActions cancel submitLabel="Add contact" pending={pending} pendingLabel="Adding…" disabled={!email.trim()} disabledReason="Enter an email first." />
    </FormBody>
  );
}
