import { cn } from "@foundry/ui/cn";
import { Link, useRouteContext } from "@tanstack/react-router";
import { allows } from "../lib/auth/permissions";

type Tab = "sent" | "received" | "failures" | "suppressions";

// Read checks only: a suspended workspace still sees the tabs it can read.
// failures and suppressions are plain links until their routes land; the others route in-app.
const TABS: { key: Tab; label: string; need: Record<string, string[]>; dir?: "out" | "in" }[] = [
  { key: "sent", label: "Sent", need: { log: ["read"] }, dir: "out" },
  { key: "received", label: "Received", need: { mailbox: ["read"] }, dir: "in" },
  { key: "failures", label: "Failed to receive", need: { mailbox: ["read"] } },
  { key: "suppressions", label: "Suppressions", need: { sending: ["read"] } },
];

export function MessagesTabs({ active }: { active: Tab }) {
  const { shell } = useRouteContext({ from: "/_app" });
  const roles = shell.active?.roles ?? [];
  return (
    <nav aria-label="Message views" className="flex gap-1 overflow-x-auto border-b px-4">
      {TABS.filter((t) => allows(roles, t.need)).map((tab) => {
        const className = cn(
          "-mb-px border-b-2 px-2 py-2 text-sm whitespace-nowrap",
          tab.key === active
            ? "border-primary font-medium text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        );
        const current = tab.key === active ? "page" : undefined;
        return tab.dir ? (
          <Link key={tab.key} to="/messages" search={{ dir: tab.dir }} className={className} aria-current={current}>
            {tab.label}
          </Link>
        ) : (
          <a key={tab.key} href={`/messages/${tab.key}`} className={className} aria-current={current}>
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
