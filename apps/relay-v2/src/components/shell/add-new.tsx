import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { Link, useRouteContext } from "@tanstack/react-router";
import ChevronDown from "lucide-react/icons/chevron-down";
import { createItems } from "./nav";
import { withNew } from "./scope";

const MENU = ["app", "domain", "address", "campaign", "list", "template", "invite"];

export function AddNewMenu() {
  const { shell } = useRouteContext({ from: "/_app" });
  const allowed = createItems(shell.active?.roles ?? [], shell.active?.status === "suspended");
  const items = MENU.flatMap((id) => allowed.find((c) => c.id === id) ?? []);
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>
        Add New
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {items.map((c) => (
          <DropdownMenuItem
            key={c.id}
            render={<Link to={c.to as string} search={((prev: Record<string, unknown>) => withNew(prev, c.new)) as never} />}
          >
            {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
