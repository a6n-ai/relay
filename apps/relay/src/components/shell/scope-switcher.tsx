import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Button } from "@foundry/ui/button";
import { initials } from "@foundry/ui/initials";
import { Input } from "@foundry/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { Link, useLocation, useRouteContext, useSearch } from "@tanstack/react-router";
import Check from "lucide-react/icons/check";
import ChevronsUpDown from "lucide-react/icons/chevrons-up-down";
import { useState } from "react";
import { createItems } from "./nav";
import { effectiveApp, scopeLabel, scopeSearch, showsAllApps } from "./scope";

const row =
  "flex h-9 items-center justify-between gap-2 rounded-md px-2 text-sm hover:bg-muted focus-visible:bg-muted outline-none";

export function ScopeSwitcher() {
  const { shell } = useRouteContext({ from: "/_app" });
  const { appId } = useSearch({ strict: false }) as { appId?: string };
  const pathname = useLocation({ select: (l) => l.pathname });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  const apps = shell.apps.filter((a) => a.name.toLowerCase().includes(needle));
  const current = effectiveApp(shell.apps, appId, pathname);
  const canCreateApp = createItems(shell.active?.roles ?? [], shell.active?.status === "suspended").some((i) => i.id === "app");
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const choice = (id: string | undefined, label: string) => (
    <Link
      key={id ?? "all"}
      to={pathname as string}
      search={((prev: Record<string, unknown>) => scopeSearch(prev, id)) as never}
      className={row}
      onClick={close}
    >
      <span className="truncate">{label}</span>
      {current === id ? <Check aria-hidden className="size-4 shrink-0" /> : null}
    </Link>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" aria-label="Switch app scope" className="max-w-64 gap-2 px-2 text-base font-medium" />}>
        <Avatar size="sm" className="rounded-full after:rounded-full">
          <AvatarFallback className="rounded-full bg-muted text-foreground">{current ? initials(scopeLabel(shell.apps, current)) : "A"}</AvatarFallback>
        </Avatar>
        <span className="truncate">{scopeLabel(shell.apps, current)}</span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-1.5 p-1.5">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find app" aria-label="Find app" />
        <div className="flex max-h-64 flex-col overflow-y-auto">
          {showsAllApps(pathname) && "all apps".includes(needle) ? choice(undefined, "All apps") : null}
          {apps.map((a) => choice(a.id, a.name))}
        </div>
        {canCreateApp ? (
          <>
            <div className="-mx-1.5 border-t" />
            <Link to="/apps/new" className={row} onClick={close}>
              New app
            </Link>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
