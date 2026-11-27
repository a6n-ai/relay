import { Button } from "@foundry/ui/button";
import { FileUpload, FileUploadDropzone, FileUploadTrigger } from "@foundry/ui/file-upload";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { consentHint } from "../../components/lists/consent-labels";
import { PageDenied } from "../../components/page/page-denied";
import { CreatePage } from "../../components/page/create-page";
import { FormActions, FormError, FormPanel } from "../../components/form/form-parts";
import { SettingsCard } from "../../components/page/settings-card";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/lib/use-can";
import { fetchLists, importCsvFn } from "../../console/lists.fns";
import { CSV_IMPORT_MAX_BYTES } from "../../shared/limits";
import { str } from "../../components/lib/route-search";
import { DefinitionList } from "../../components/page/definition-list";
import { useSubmit } from "../../components/lib/use-submit";


export const Route = createFileRoute("/_app/lists_/$listId_/import")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: str(search.appId),
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
  const canImport = useCan({ list: ["import"] });
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const { pending, error, setError, run } = useSubmit();
  const listsCrumb = { label: "Lists", to: "/lists", search: { appId } };
  const back = () => void navigate({ to: "/lists/$listId", params: { listId }, search: { appId } });

  if (!page || !canImport) {
    return <PageDenied crumbs={[listsCrumb, { label: "Import contacts" }]} />;
  }
  const { list } = page;
  if (!list) {
    return <PageDenied crumbs={[listsCrumb, { label: "Import contacts" }]} reason="not-found" label="List not found" />;
  }
  const crumbs = [listsCrumb, { label: list.name, to: "/lists/$listId", params: { listId }, search: { appId } }, { label: "Import contacts" }];

  async function submit(event: FormEvent) {
    event.preventDefault();
    const file = files[0];
    if (!file) return;
    await run(async () => {
      const counts = await importCsvFn({ data: { listId, csv: await file.text() } });
      if (counts) setResult(counts);
      else setError("Could not import this file.");
    }, "Could not import this file.");
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
            action={
              <Button render={<Link to="/lists/$listId" params={{ listId }} search={{ appId }} />}>Back to list</Button>
            }
          >
            <DefinitionList
              layout="rows"
              items={rows.filter(([label, n]) => n > 0 || label === "Added").map(([label, n, note]) => ({ term: label, value: n, note }))}
            />
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
            maxSize={CSV_IMPORT_MAX_BYTES}
            value={files}
            onValueChange={(next) => {
              setFiles(next);
              setError(null);
            }}
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
