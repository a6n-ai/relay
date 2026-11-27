import { useNavigate } from "@tanstack/react-router";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@foundry/ui/command";
import { Kbd } from "@foundry/ui/kbd";
import { localStore } from "@foundry/ui/safe-storage";
import SearchIcon from "lucide-react/icons/search";
import { useEffect, useMemo, useState } from "react";
import { isTypingTarget } from "../page/keys";
import { usePageOf } from "./page-data";
import { type FindEntry, findEntries, pushRecent, readRecent } from "./find";
import { withNew } from "./scope";
import { type Shell } from "../../shared/views";
import { untyped } from "../lib/route-search";

const RECENT_KEY = "relay-find-recent";
const GROUPS: FindEntry["group"][] = ["Pages", "Apps", "Actions"];

export function FindPalette({ shell }: { shell: Shell }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const navigate = useNavigate();
  const pageOf = usePageOf();
  const entries = useMemo(() => findEntries(shell, pageOf), [shell, pageOf]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing) return;
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const bareF = e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
      if (!cmdK && !bareF) return;
      if (isTypingTarget(document.activeElement as HTMLElement | null)) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setRecent(readRecent(localStore.getJson<unknown>(RECENT_KEY, [])));
    }
  }, [open]);

  const pick = (entry: FindEntry) => {
    localStore.setJson(RECENT_KEY, pushRecent(readRecent(localStore.getJson<unknown>(RECENT_KEY, [])), entry.id));
    setOpen(false);
    void navigate(untyped({ to: entry.to, search: entry.id.startsWith("new:") ? (prev: Record<string, unknown>) => withNew(prev, entry.search?.new ? 1 : undefined) : entry.search }));
  };

  const recentEntries = recent.flatMap((id) => entries.find((e) => e.id === id) ?? []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-(--ui-radius-control) border bg-sidebar px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left">Find</span>
        <Kbd>F</Kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Find" description="Jump to a page, app or action" className="duration-0">
        <Command>
          <CommandInput placeholder="Find…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty className="empty:hidden">No results.</CommandEmpty>
            {query === "" && recentEntries.length > 0 ? (
              <>
                <CommandGroup heading="Recent">
                  {recentEntries.map((e) => (
                    <CommandItem key={e.id} value={`recent ${e.id}`} onSelect={() => pick(e)}>
                      {e.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}
            {GROUPS.map((group) => {
              const items = entries.filter((e) => e.group === group);
              return items.length === 0 ? null : (
                <CommandGroup key={group} heading={group}>
                  {items.map((e) => (
                    <CommandItem key={e.id} value={`${e.label} ${e.id}`} onSelect={() => pick(e)}>
                      {e.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
