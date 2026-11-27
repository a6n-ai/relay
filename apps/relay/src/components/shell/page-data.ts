import { type StaticDataRouteOption, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

// One page declaration: every `_app` route sets `staticData`; crumbs, document title, description, nav labels, scope and the workspace-less exceptions derive from it.
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    title?: string;
    copy?: string;
    // The page reads one app: "all" shows every app until one is picked, "first" falls back to the first app.
    scoped?: "all" | "first";
    // Reachable with no workspace: always, or only for the platform admin.
    allowsNoWorkspace?: true | "platform";
  }
}

export type PageData = StaticDataRouteOption;
export type PageOf = (to: string) => PageData | undefined;

export function usePageOf(): PageOf {
  const router = useRouter();
  return useCallback<PageOf>(
    (to) => (router.routesByPath as unknown as Record<string, { options: { staticData?: PageData } } | undefined>)[to]?.options.staticData,
    [router],
  );
}
