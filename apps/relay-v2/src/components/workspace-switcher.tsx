import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { CreateDialog } from "./create-dialog";
import { NewWorkspaceForm } from "./new-workspace-form";

export function WorkspaceSwitcher({
  active,
  workspaces,
}: {
  active: { id: string; name: string } | null;
  workspaces: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function switchTo(organizationId: string) {
    const res = await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (!res.ok) {
      setError("Could not switch workspace.");
      return;
    }
    setError(null);
    await router.invalidate();
  }

  return (
    <div className="flex flex-col gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label="Switch workspace" />}>
          {active?.name ?? "Choose workspace"}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => switchTo(w.id)}>
              {w.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateDialog trigger="New workspace" title="New workspace">{(done) => <NewWorkspaceForm done={done} />}</CreateDialog>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
