import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Button } from "@foundry/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@foundry/ui/dropdown-menu";
import { initials } from "@foundry/ui/initials";
import { localStore } from "@foundry/ui/safe-storage";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";
import Ellipsis from "lucide-react/icons/ellipsis";
import { useEffect, useState } from "react";
import { authOptionsFn } from "../../console/shell.fns";
import { useSignOut } from "../sign-out-button";
import { SignInMethodsDialog } from "./sign-in-methods-dialog";
import { resolveTheme, THEME_KEY, type ThemePref } from "./theme";

const isPref = (v: string | null): v is ThemePref => v === "dark" || v === "light" || v === "system";

function apply(pref: ThemePref) {
  const dark = resolveTheme(pref, matchMedia("(prefers-color-scheme: dark)").matches) === "dark";
  document.documentElement.classList.toggle("dark", dark);
}

export function UserMenu({ email, name }: { email: string; name?: string }) {
  const signOut = useSignOut();
  const [pref, setPref] = useState<ThemePref>("dark");
  const [google, setGoogle] = useState(false);
  const [methodsOpen, setMethodsOpen] = useState(false);

  useEffect(() => {
    authOptionsFn().then((o) => setGoogle(o.google), () => {});
  }, []);

  useEffect(() => {
    const stored = localStore.get(THEME_KEY);
    setPref(isPref(stored) ? stored : "dark");
  }, []);

  useEffect(() => {
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  function choose(next: string) {
    if (!isPref(next)) return;
    setPref(next);
    localStore.set(THEME_KEY, next);
    apply(next);
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <Avatar size="sm">
        <AvatarFallback>{initials(name ?? email)}</AvatarFallback>
      </Avatar>
      <Tooltip>
        <TooltipTrigger render={<span className="min-w-0 flex-1 truncate text-sm text-sidebar-foreground" />}>{email}</TooltipTrigger>
        <TooltipContent side="top">{email}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="User menu" />}>
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="min-w-44 transition-none">
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={pref} onValueChange={choose}>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          {google ? <DropdownMenuItem onClick={() => setMethodsOpen(true)}>Sign-in methods</DropdownMenuItem> : null}
          <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {methodsOpen ? <SignInMethodsDialog onOpenChange={setMethodsOpen} /> : null}
    </div>
  );
}
