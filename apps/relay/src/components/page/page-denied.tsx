import { useRouteContext } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { DeniedState, deniedReason } from "./denied-state";
import { PageHeader } from "../shell/page-header";

type Reason = ComponentProps<typeof DeniedState>["reason"];

// The page header plus the denied or not-found state. Without a `reason` the shell says why the page is closed (no workspace, suspended, role).
export function PageDenied({ reason, label, ...header }: ComponentProps<typeof PageHeader> & { reason?: Reason; label?: string }) {
  const { shell } = useRouteContext({ from: "/_app" });
  return (
    <>
      <PageHeader {...header} />
      <DeniedState reason={reason ?? deniedReason(shell)} label={label} />
    </>
  );
}
