import { useNavigate, useSearch } from "@tanstack/react-router";
import { trimSlash } from "../lib/path";
import type { PageOf } from "./page-data";
import { untyped } from "../lib/route-search";
import { defaultApp } from "../../shared/scope";

export const isAppScoped = (pathname: string, pageOf: PageOf) => Boolean(pageOf(trimSlash(pathname))?.scoped);

// Pages with `scoped: "all"` read every app when none is picked; the others load the first app.
export const showsAllApps = (pathname: string, pageOf: PageOf) => pageOf(trimSlash(pathname))?.scoped === "all";

export const pickApp = (apps: { id: string }[], appId: string | undefined, all: boolean): string | undefined =>
  apps.some((a) => a.id === appId) ? appId : defaultApp(apps, all);

export const scopeLabel = (apps: { id: string; name: string }[], appId: string | undefined) =>
  apps.find((a) => a.id === appId)?.name ?? "All apps";

export function scopeSearch(prev: Record<string, unknown>, appId: string | undefined) {
  const { cursor: _cursor, offset: _offset, appId: _appId, ...rest } = prev;
  return appId ? { ...rest, appId } : rest;
}

// The `new` search param opens a create dialog on the target page. Create and Find link with `withNew`; the page reads it with `useNewParam`.
// Create and Find open the create page, or a dialog on the target page when `kind` is set; the current app stays picked there.
export function withNew(prev: Record<string, unknown>, kind?: 1) {
  const keep = typeof prev.appId === "string" ? { appId: prev.appId } : {};
  return kind ? { ...keep, new: kind } : keep;
}

export function useNewParam(): [open: boolean, setOpen: (v: boolean) => void] {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { new?: unknown };
  const open = String(search.new) === "1";
  const setOpen = (v: boolean) => {
    void navigate({
      to: ".",
      search: untyped((prev: Record<string, unknown>) => {
        const { new: _n, ...rest } = prev;
        return v ? { ...rest, new: 1 } : rest;
      }),
      replace: true,
    });
  };
  return [open, setOpen];
}

// Sidebar links into a scoped page keep the picked app.
export function navSearch(to: string, search: Record<string, string> | undefined, appId: string | undefined, pageOf: PageOf) {
  return appId && isAppScoped(to, pageOf) ? { ...search, appId } : search;
}
