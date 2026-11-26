import { APP_SCOPED } from "./nav";

const trim = (pathname: string) => (pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname);

export const isAppScoped = (pathname: string) => APP_SCOPED.includes(trim(pathname));

// Messages and Lists read every app when none is picked; Campaigns, Templates and Automations load the first app.
export const showsAllApps = (pathname: string) => ["/messages", "/lists"].includes(trim(pathname));

export function effectiveApp(apps: { id: string }[], appId: string | undefined, pathname: string): string | undefined {
  if (apps.some((a) => a.id === appId)) return appId;
  return showsAllApps(pathname) ? undefined : apps[0]?.id;
}

export const scopeLabel = (apps: { id: string; name: string }[], appId: string | undefined) =>
  apps.find((a) => a.id === appId)?.name ?? "All apps";

export function scopeSearch(prev: Record<string, unknown>, appId: string | undefined) {
  const { cursor: _cursor, offset: _offset, appId: _appId, ...rest } = prev;
  return appId ? { ...rest, appId } : rest;
}

// Create and Find open a dialog on the target page; the current app stays picked there.
export function withNew(prev: Record<string, unknown>) {
  return typeof prev.appId === "string" ? { appId: prev.appId, new: 1 } : { new: 1 };
}

// Sidebar links into a scoped page keep the picked app.
export function navSearch(to: string, search: Record<string, string> | undefined, appId: string | undefined) {
  return appId && isAppScoped(to) ? { ...search, appId } : search;
}
