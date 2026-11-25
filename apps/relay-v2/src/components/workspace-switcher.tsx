import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Badge } from "@foundry/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { initials } from "@foundry/ui/initials";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@foundry/ui/sidebar";
import { Link, useRouter } from "@tanstack/react-router";
import Check from "lucide-react/icons/check";
import ChevronsUpDown from "lucide-react/icons/chevrons-up-down";
import { useState } from "react";
import type { OrgRole } from "../console/actor";
import { CreateDialog } from "./create-dialog";
import { NewWorkspaceForm } from "./new-workspace-form";

type Active = { id: string; name: string; status: "active" | "suspended"; roles: OrgRole[] };

// Typed string until the /settings routes exist, so the route tree does not reject it.
const SETTINGS: string = "/settings";

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function WorkspaceSwitcher({ active, workspaces }: { active: Active | null; workspaces: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const role = active?.roles[0];

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
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" aria-label="Switch workspace" />}>
            <Avatar size="sm" className="rounded-md after:rounded-md">
              <AvatarFallback className="rounded-md bg-primary text-primary-foreground">{initials(active?.name)}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 leading-none">
              <span className="w-full truncate font-medium">{active?.name ?? "Choose workspace"}</span>
              <span className="flex items-center gap-1">
                {role ? <Badge variant="neutral" size="sm">{capitalise(role)}</Badge> : null}
                {active?.status === "suspended" ? <Badge variant="warning" size="sm">Suspended</Badge> : null}
              </span>
            </span>
            <ChevronsUpDown className="ml-auto text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56 transition-none">
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onClick={() => switchTo(w.id)}>
                <span className="truncate">{w.name}</span>
                {w.id === active?.id ? <Check className="ml-auto" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setCreating(true)}>New workspace</DropdownMenuItem>
            <DropdownMenuItem render={<Link to={SETTINGS} />}>Workspace settings</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <CreateDialog title="New workspace" open={creating} onOpenChange={setCreating}>
          {(done) => <NewWorkspaceForm done={done} />}
        </CreateDialog>
        {error ? <p role="alert" className="px-2 pt-1 text-xs text-destructive">{error}</p> : null}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
