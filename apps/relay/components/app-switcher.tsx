"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppWindowIcon, CheckIcon, PlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@foundry/ui/dropdown-menu";
import { readActiveAppCookie, writeActiveAppCookie } from "@/lib/apps/active-app-cookie";

type AppRow = { publicId: string; name: string; slug: string };

/** Sidebar control: switch the active app inside the current workspace. */
export function AppSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [apps, setApps] = useState<AppRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoaded(false);
      try {
        const res = await fetch("/api/notifications/apps", { credentials: "same-origin" });
        if (!res.ok) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const rows = (await res.json()) as AppRow[];
        if (cancelled) return;
        setApps(rows);
        const cookieId = readActiveAppCookie();
        const match = rows.find((a) => a.publicId === cookieId);
        if (match) {
          setActiveId(match.publicId);
        } else if (rows[0]) {
          writeActiveAppCookie(rows[0].publicId);
          setActiveId(rows[0].publicId);
        } else {
          writeActiveAppCookie(null);
          setActiveId(null);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void load();
    window.addEventListener("relay:workspace-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("relay:workspace-changed", load);
    };
  }, [pathname]);

  const active = apps.find((a) => a.publicId === activeId) ?? apps[0];

  function select(publicId: string) {
    startTransition(() => {
      writeActiveAppCookie(publicId);
      setActiveId(publicId);
      router.refresh();
    });
  }

  if (!loaded) {
    return (
      <Button variant="ghost" size="sm" className="h-8 w-full justify-start gap-2 px-2 font-medium" disabled>
        <AppWindowIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-muted-foreground">App…</span>
      </Button>
    );
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
          <AppWindowIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{active?.name ?? "Create an app"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Apps</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {apps.map((app) => (
          <DropdownMenuItem key={app.publicId} onClick={() => select(app.publicId)} className="gap-2">
            {app.publicId === activeId ? <CheckIcon className="size-4" /> : <span className="size-4" />}
            <span className="truncate">{app.name}</span>
          </DropdownMenuItem>
        ))}
        {apps.length === 0 ? (
          <DropdownMenuItem disabled>No apps yet — create one to start</DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/dashboard/tenants")}>
          <PlusIcon className="size-4" />
          {apps.length === 0 ? "Create an app" : "Manage apps"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
