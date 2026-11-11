import { ViewHeader } from "@/components/ds/view-header";
import { WorkspaceCreateForm } from "./workspace-create-form";

export default function WorkspacesPage() {
  return (
    <>
      <ViewHeader
        title="Workspaces"
        subtitle="Each workspace starts empty. After you create one, add an app to begin sending."
      />
      <div className="mx-auto max-w-lg px-6 py-8">
        <WorkspaceCreateForm />
      </div>
    </>
  );
}
