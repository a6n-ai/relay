"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2Icon, CheckIcon, PlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@foundry/ui/dropdown-menu";
import { writeActiveAppCookie } from "@/lib/apps/active-app-cookie";
import { authClient } from "@/lib/auth/client";

type OrgRow = { id: string; name: string; slug: string };

/** Sidebar control: switch active workspace (Better Auth organization). */
export function WorkspaceSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [listRes, session] = await Promise.all([
        authClient.organization.list(),
        authClient.getSession(),
      ]);
      if (cancelled) return;
      setOrgs((listRes.data ?? []) as OrgRow[]);
      const aid = (session.data?.session as { activeOrganizationId?: string | null } | undefined)
        ?.activeOrganizationId;
      setActiveId(typeof aid === "string" ? aid : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const active = orgs.find((o) => o.id === activeId) ?? orgs[0];

  function select(organizationId: string) {
    startTransition(async () => {
      await authClient.organization.setActive({ organizationId });
      // Apps belong to a workspace — drop the prior app so the switcher re-picks.
      writeActiveAppCookie(null);
      setActiveId(organizationId);
      window.dispatchEvent(new Event("relay:workspace-changed"));
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-start gap-2 px-2 font-medium"
          disabled={pending}
        >
          <Building2Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{active?.name ?? "Choose workspace"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Your current client</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((org) => (
          <DropdownMenuItem key={org.id} onClick={() => select(org.id)} className="gap-2">
            {org.id === activeId ? <CheckIcon className="size-4" /> : <span className="size-4" />}
            <span className="min-w-0 flex-1 truncate">{org.name}</span>
            {org.id === activeId ? (
              <span className="text-[11px] text-muted-foreground">Current</span>
            ) : null}
          </DropdownMenuItem>
        ))}
        {orgs.length === 0 ? (
          <DropdownMenuItem disabled>No workspaces yet</DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/dashboard/workspaces")}>
          <PlusIcon className="size-4" />
          New workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
