import { APP_SCOPED } from "./nav";

export const isAppScoped = (pathname: string) => APP_SCOPED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export const scopeLabel = (apps: { id: string; name: string }[], appId: string | undefined) =>
  apps.find((a) => a.id === appId)?.name ?? "All apps";

export function scopeSearch(prev: Record<string, unknown>, appId: string | undefined) {
  const { cursor: _cursor, appId: _appId, ...rest } = prev;
  return appId ? { ...rest, appId } : rest;
}
