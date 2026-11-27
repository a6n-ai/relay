import { Toaster } from "@foundry/ui/toast";
import { Outlet } from "@tanstack/react-router";
import type { Shell } from "../console/shell";
import { AppShell } from "./app-shell";
import { FindPalette } from "./shell/find-palette";

export default function ConsoleLayout({ shell }: { shell: Shell }) {
  return (
    <>
      <AppShell shell={shell} find={<FindPalette shell={shell} />}>
        <Outlet />
      </AppShell>
      <Toaster />
    </>
  );
}
