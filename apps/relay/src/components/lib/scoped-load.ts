import { fetchApps } from "../../console/apps.fns";
import { defaultApp } from "../../shared/scope";

export const isNotFound = (err: unknown): boolean => err instanceof Error && err.message === "not found";

type Apps = NonNullable<Awaited<ReturnType<typeof fetchApps>>>;

// A scoped page's loader data: null is denied (no workspace, suspended, or no permission), `missing` is an app or record that is not there.
export type Scoped<T extends object> = null | { missing: true } | ({ apps: Apps; appId: string | undefined } & T);

// The one loader for a page that reads a single app: apps, the picked app (or the default), then the page's own fetch.
// `fetch` returns null for denied, or `{ missing: true }`; a thrown "not found" is the same as missing. `none` is the data when the workspace has no app.
export async function scopedLoad<T extends object>(
  wanted: string | undefined,
  fetch: (appId: string) => Promise<T | null | { missing: true }>,
  none: T,
): Promise<Scoped<T>> {
  const apps = await fetchApps();
  if (!apps) return null;
  const appId = wanted ?? defaultApp(apps, false);
  if (!appId) return { apps, appId, ...none };
  const data = await fetch(appId).catch((err) => {
    if (isNotFound(err)) return { missing: true as const };
    throw err;
  });
  if (!data) return null;
  if ("missing" in data) return { missing: true };
  return { apps, appId, ...data };
}
