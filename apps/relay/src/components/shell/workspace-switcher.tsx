import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Badge } from "@foundry/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { initials } from "@foundry/ui/initials";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@foundry/ui/sidebar";
import { Link, useRouter } from "@tanstack/react-router";
import Check from "lucide-react/icons/check";
import ChevronsUpDown from "lucide-react/icons/chevrons-up-down";
import { useState } from "react";
import { isSuspended, type WorkspaceStatus } from "../../shared/limits";
import { type OrgRole } from "../../shared/roles";
import { authFetch } from "../lib/auth-fetch";

type Active = { id: string; name: string; status: WorkspaceStatus; roles: OrgRole[] };

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function WorkspaceSwitcher({ active, workspaces }: { active: Active | null; workspaces: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const role = active?.roles[0];

  async function switchTo(organizationId: string) {
    const res = await authFetch("/organization/set-active", { organizationId });
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
                {isSuspended(active?.status) ? <Badge variant="warning" size="sm">Suspended</Badge> : null}
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
            <DropdownMenuItem render={<Link to="/workspaces/new" />}>New workspace</DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/settings" />}>Workspace settings</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {error ? <p role="alert" className="px-2 pt-1 text-xs text-destructive">{error}</p> : null}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
