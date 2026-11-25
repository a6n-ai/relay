import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { Link, useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import Plus from "lucide-react/icons/plus";
import { createItems } from "./nav";

export function CreateMenu() {
  const { shell } = useRouteContext({ from: "/_app" });
  const items = createItems(shell.active?.roles ?? [], shell.active?.status === "suspended");
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" />}>
        <Plus aria-hidden /> Create
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem key={item.id} render={<Link to={item.to as string} search={{ new: 1 } as never} />}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function useNewParam(): [open: boolean, setOpen: (v: boolean) => void] {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { new?: unknown };
  const open = search.new !== undefined && search.new !== false && search.new !== 0 && search.new !== "0";
  const setOpen = (v: boolean) => {
    void navigate({
      to: ".",
      search: ((prev: Record<string, unknown>) => {
        const { new: _n, ...rest } = prev;
        return v ? { ...rest, new: 1 } : rest;
      }) as never,
      replace: true,
    });
  };
  return [open, setOpen];
}
