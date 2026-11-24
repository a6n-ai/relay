import { cn } from "@foundry/ui/cn";
import { Link, useRouteContext } from "@tanstack/react-router";
import { allows } from "../lib/auth/permissions";

type Tab = "campaigns" | "templates" | "automations";

// Read checks only, the same as the messages tabs: a suspended workspace still sees the tabs it can read.
const TABS: { key: Tab; label: string; need: Record<string, string[]> }[] = [
  { key: "campaigns", label: "Campaigns", need: { campaign: ["read"] } },
  { key: "templates", label: "Templates", need: { template: ["read"] } },
];

export function CampaignsTabs({ active, appId }: { active: Tab; appId?: string }) {
  const { shell } = useRouteContext({ from: "/_app" });
  const roles = shell.active?.roles ?? [];
  return (
    <nav aria-label="Campaign views" className="flex gap-1 overflow-x-auto border-b px-4">
      {TABS.filter((t) => allows(roles, t.need)).map((tab) => {
        const className = cn(
          "-mb-px border-b-2 px-2 py-2 text-sm whitespace-nowrap",
          tab.key === active
            ? "border-primary font-medium text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        );
        const current = tab.key === active ? "page" : undefined;
        return (
          <Link
            key={tab.key}
            to={tab.key === "campaigns" ? "/campaigns" : "/campaigns/templates"}
            search={{ appId }}
            className={className}
            aria-current={current}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
