import { Button } from "@foundry/ui/button";
import { FileUpload, FileUploadDropzone, FileUploadTrigger } from "@foundry/ui/file-upload";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { consentHint } from "../../components/consent-labels";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { CreatePage } from "../../components/page/create-page";
import { FormActions, FormError, FormPanel } from "../../components/page/form-parts";
import { SettingsCard } from "../../components/page/settings-card";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { fetchLists, importCsvFn } from "../../console/lists.fns";

const MAX_CSV_BYTES = 2_000_000;

export const Route = createFileRoute("/_app/lists_/$listId_/import")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId }),
  loader: async ({ deps, params }) => {
    const lists = deps.appId ? await fetchLists({ data: { appId: deps.appId } }) : [];
    if (!lists) return null;
    return { list: "missing" in lists ? undefined : lists.find((l) => l.id === params.listId) };
  },
  component: ImportPage,
});

type Result = NonNullable<Awaited<ReturnType<typeof importCsvFn>>>;

function ImportPage() {
  const page = Route.useLoaderData();
  const { appId } = Route.useSearch();
  const { listId } = Route.useParams();
  const { shell } = Route.useRouteContext();
  const canImport = useCan({ list: ["import"] });
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const listsCrumb = { label: "Lists", to: "/lists", search: { appId } };
  const back = () => void navigate({ to: "/lists/$listId", params: { listId }, search: { appId } });

  if (!page || !canImport) {
    return (
      <>
        <PageHeader crumbs={[listsCrumb, { label: "Import contacts" }]} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const { list } = page;
  if (!list) {
    return (
      <>
        <PageHeader crumbs={[listsCrumb, { label: "Import contacts" }]} />
        <DeniedState reason="not-found" label="List not found" />
      </>
    );
  }
  const crumbs = [listsCrumb, { label: list.name, to: "/lists/$listId", params: { listId }, search: { appId } }, { label: "Import contacts" }];

  async function submit(event: FormEvent) {
    event.preventDefault();
    const file = files[0];
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const counts = await importCsvFn({ data: { listId, csv: await file.text() } });
      setResult(counts ?? null);
    } catch (err) {
      setError(errorText(err, "Could not import this file."));
    } finally {
      setPending(false);
    }
  }

  if (result) {
    const rows: [string, number, string?][] = [
      ["Added", result.added],
      ["Already on the list", result.existing],
      ["Suppressed", result.suppressed, "On your suppression list, so not added."],
      ["Invalid", result.invalid, "Rows without a valid email."],
      ["Duplicates", result.duplicates, "The same email more than once in the file."],
    ];
    return (
      <>
        <PageHeader crumbs={crumbs} description="Import finished." />
        <FormPanel className="pt-2">
          <SettingsCard
            title="Result"
            description={`Added ${result.added}${result.suppressed ? `, suppressed ${result.suppressed}` : ""}.`}
            action={
              <Button render={<Link to="/lists/$listId" params={{ listId }} search={{ appId }} />}>Back to list</Button>
            }
          >
            <dl className="grid gap-2 text-sm">
              {rows
                .filter(([label, n]) => n > 0 || label === "Added")
                .map(([label, n, note]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 border-b py-1.5 last:border-b-0">
                    <dt>
                      {label}
                      {note ? <span className="block text-xs text-muted-foreground">{note}</span> : null}
                    </dt>
                    <dd className="tabular-nums">{n}</dd>
                  </div>
                ))}
            </dl>
          </SettingsCard>
        </FormPanel>
      </>
    );
  }

  return (
    <CreatePage crumbs={crumbs} description={`Add people to ${list.name} from a CSV file.`} onSubmit={submit}>
      <SettingsCard title="CSV file" description="Needs an email column. Optional: first_name, last_name, name, consent_at.">
        <div className="grid gap-3">
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
          <p className="text-xs text-muted-foreground">{consentHint(list.consentSource)}</p>
        </div>
      </SettingsCard>
      <FormError message={error} />
      <FormActions
        onCancel={back}
        submitLabel="Import contacts"
        pending={pending}
        pendingLabel="Importing…"
        disabled={files.length === 0}
        disabledReason="Choose a CSV file first."
      />
    </CreatePage>
  );
}
