import { allows } from "../../shared/permissions";
import { startApp } from "../../shared/scope";
import type { Shell } from "../../shared/views";

export const isNotFound = (err: unknown): boolean => err instanceof Error && err.message === "not found";

// The client twin of the server's orMissing: a thrown "not found" becomes `{ missing: true }` data the page renders as a not-found state.
export const orMissing = <T>(call: Promise<T>): Promise<T | { missing: true }> =>
  call.catch((err) => {
    if (isNotFound(err)) return { missing: true as const };
    throw err;
  });

type Apps = Shell["apps"];

// Reading apps needs tenant:read (as fetchApps did); without it a scoped page is denied even when there is no app to fetch.
export const canReadApps = (shell: Shell): boolean => !!shell.active && allows(shell.active.roles, { tenant: ["read"] });

// A scoped page's loader data: null is denied (no workspace, suspended, or no permission), `missing` is an app or record that is not there.
export type Scoped<T extends object> = null | { missing: true } | ({ apps: Apps; appId: string | undefined } & T);

// The one loader for a page that reads a single app: the shell's apps, the picked app (or the default), then the page's own fetch.
// `fetch` returns null for denied, or `{ missing: true }`; a thrown "not found" is the same as missing. `none` is the data when the workspace has no app.
export async function scopedLoad<T extends object>(
  wanted: string | undefined,
  shell: Shell,
  fetch: (appId: string) => Promise<T | null | { missing: true }>,
  none: T,
): Promise<Scoped<T>> {
  if (!canReadApps(shell)) return null;
  const apps = shell.apps;
  const appId = startApp(apps, wanted);
  if (!appId) return { apps, appId, ...none };
  const data = await orMissing(fetch(appId));
  if (!data) return null;
  if ("missing" in data) return { missing: true };
  return { apps, appId, ...data };
}
