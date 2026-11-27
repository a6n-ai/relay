import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { Link, useRouteContext } from "@tanstack/react-router";
import ChevronDown from "lucide-react/icons/chevron-down";
import { createItems } from "./nav";
import { withNew } from "./scope";
import { untyped } from "../lib/route-search";

export function AddNewMenu() {
  const { shell } = useRouteContext({ from: "/_app" });
  const allowed = createItems(shell.active?.roles ?? [], shell.active?.status === "suspended");
  const items = allowed.filter((c) => c.menu !== false);
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        Add New
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {items.map((c) => (
          <DropdownMenuItem
            key={c.id}
            render={<Link to={c.to} search={untyped((prev: Record<string, unknown>) => withNew(prev, c.new))} />}
          >
            {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
